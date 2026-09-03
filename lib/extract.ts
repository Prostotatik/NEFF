/**
 * Fetching the text behind a URL the user pasted.
 *
 * This is retrieval, not inference: no model is involved here, and no model
 * outside the Gonka Network is involved anywhere. Everything this file returns
 * is handed to Gonka-hosted models for all reasoning about it.
 *
 * The URL comes from an untrusted user, so this is also an SSRF surface: without
 * a guard, "verify http://localhost:3000/api/..." or a link to a cloud metadata
 * endpoint would make our server fetch its own private network on request.
 */

import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 20_000;

export class UnsafeUrlError extends Error {}

/** Reject anything that resolves inside our own network. */
function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    return (
      a === "::1" ||
      a === "::" ||
      a.startsWith("fc") ||
      a.startsWith("fd") ||
      a.startsWith("fe80") ||
      a.startsWith("::ffff:")
    );
  }
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (/\s/.test(trimmed)) return false;
  return /^https?:\/\/\S+\.\S+/i.test(trimmed);
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be fetched.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new UnsafeUrlError(`Could not resolve ${url.hostname}.`);
      });

  if (addresses.length === 0) throw new UnsafeUrlError(`Could not resolve ${url.hostname}.`);
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new UnsafeUrlError("That URL points inside a private network and will not be fetched.");
    }
  }
  return url;
}

/** Strip HTML down to readable text, keeping paragraph breaks. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function htmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 200) : "";
}

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

/** Fetch a public page and return its readable text. Throws on anything unsafe. */
export async function fetchPage(raw: string): Promise<FetchedPage> {
  const url = await assertPublicUrl(raw);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      redirect: "error", // a redirect could land somewhere the guard already rejected
      signal: controller.signal,
      headers: {
        "User-Agent": "QuorumFactCheck/0.1 (+https://github.com/quorum-factcheck)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
      },
    });

    if (!response.ok) {
      throw new UnsafeUrlError(`That page returned HTTP ${response.status}.`);
    }

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
      throw new UnsafeUrlError(`That URL serves ${type || "an unknown type"}, which cannot be read as text.`);
    }

    const buffer = await response.arrayBuffer();
    const html = new TextDecoder("utf-8").decode(buffer.slice(0, MAX_BYTES));
    const text = htmlToText(html);

    if (text.length < 120) {
      throw new UnsafeUrlError(
        "That page has almost no readable text — it may need JavaScript to render. Paste the claim itself instead.",
      );
    }

    return { url: url.toString(), title: htmlTitle(html), text };
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new UnsafeUrlError(
      aborted ? "That page took too long to respond." : "That page could not be fetched.",
    );
  } finally {
    clearTimeout(timer);
  }
}

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
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { request as httpRequest, type IncomingMessage } from "node:http";

const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 3;

export class UnsafeUrlError extends Error {}

/** Expand an IPv6 address to its full eight-group form so prefixes compare honestly. */
function expandIpv6(address: string): string {
  const bare = address.toLowerCase().split("%")[0];
  const [head, tail] = bare.includes("::") ? bare.split("::") : [bare, undefined];
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":").filter(Boolean) : [];
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return groups.map((g) => (g || "0").padStart(4, "0")).join(":");
}

/** Reject anything that resolves inside our own network. */
export function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    // An IPv4-mapped address is judged on the IPv4 it carries, so a public
    // mapped address is allowed and a private one is not.
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);

    const full = expandIpv6(address);
    if (full === "0000:0000:0000:0000:0000:0000:0000:0001") return true; // loopback
    if (full === "0000:0000:0000:0000:0000:0000:0000:0000") return true; // unspecified
    const first = parseInt(full.slice(0, 4), 16);
    if (Number.isNaN(first)) return true;
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7   unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10  link-local
    return false;
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

/** Hosts we know we cannot read, so the user gets an instruction, not a failure. */
const LOGIN_WALLED = new Map<string, string>([
  ["x.com", "X blocks servers from reading posts. Copy the text of the post and paste that instead — it verifies exactly the same way."],
  ["twitter.com", "X blocks servers from reading posts. Copy the text of the post and paste that instead — it verifies exactly the same way."],
  ["facebook.com", "Facebook blocks servers from reading posts. Paste the text of the post instead."],
  ["instagram.com", "Instagram blocks servers from reading posts. Paste the text of the caption instead."],
  ["linkedin.com", "LinkedIn blocks servers from reading posts. Paste the text of the post instead."],
  ["threads.net", "Threads blocks servers from reading posts. Paste the text of the post instead."],
]);

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeUrlError("That does not look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs can be fetched.");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const advice = LOGIN_WALLED.get(host);
  if (advice) throw new UnsafeUrlError(advice);
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

/**
 * Fetch a public page and return its readable text.
 *
 * The guard runs inside the connection rather than before it. Validating a
 * hostname with a separate DNS query and then handing the *name* to a fetch lets
 * an attacker answer the two lookups differently — a public address for the
 * check, 169.254.169.254 for the connection. Here the socket's own resolver is
 * wrapped, so the address the request connects to is the address that was
 * checked.
 *
 * The body is read incrementally and abandoned at the size cap, so a URL serving
 * an endless response cannot exhaust memory.
 */
export async function fetchPage(raw: string): Promise<FetchedPage> {
  let url = parseUrl(raw);

  for (let hop = 0; ; hop++) {
    const response = await open(url);
    const status = response.statusCode ?? 0;

    // Redirects are followed, but each hop goes through parseUrl and the guarded
    // resolver again, so a redirect cannot walk the request into a private
    // network or onto a host we know we cannot read.
    if (status >= 300 && status < 400) {
      const location = response.headers.location;
      response.destroy();
      if (!location) throw new UnsafeUrlError("That page redirected without saying where.");
      if (hop >= MAX_REDIRECTS) throw new UnsafeUrlError("That URL redirects too many times.");
      url = parseUrl(new URL(location, url).toString());
      continue;
    }

    try {
      if (status < 200 || status >= 300) {
        throw new UnsafeUrlError(`That page returned HTTP ${status}.`);
      }

      const type = String(response.headers["content-type"] ?? "");
      if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) {
        throw new UnsafeUrlError(
          `That URL serves ${type || "an unknown type"}, which cannot be read as text.`,
        );
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        const buffer = chunk as Buffer;
        chunks.push(buffer);
        bytes += buffer.length;
        if (bytes >= MAX_BYTES) break;
      }

      const html = new TextDecoder("utf-8").decode(Buffer.concat(chunks).subarray(0, MAX_BYTES));
      const text = htmlToText(html);

      if (text.length < 120) {
        throw new UnsafeUrlError(
          "That page has almost no readable text — it may need JavaScript to render. Paste the claim itself instead.",
        );
      }

      return { url: url.toString(), title: htmlTitle(html), text };
    } finally {
      response.destroy();
    }
  }
}

/** One guarded GET. Resolves with the response headers; the body is still open. */
function open(url: URL): Promise<IncomingMessage> {
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = send(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          "User-Agent": "QuorumFactCheck/0.1 (+https://github.com/quorum-factcheck)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
      },
      resolve,
    );
    req.on("timeout", () => req.destroy(new UnsafeUrlError("That page took too long to respond.")));
    req.on("error", reject);
    req.end();
  }).catch((error: unknown) => {
    if (error instanceof UnsafeUrlError) throw error;
    throw new UnsafeUrlError("That page could not be fetched.");
  });
}

/**
 * A DNS resolver that refuses to hand back a private address, used as the
 * socket's own lookup so every connection the request makes is checked.
 */
const guardedLookup = ((hostname: string, options: unknown, callback: unknown) => {
  const done = (typeof options === "function" ? options : callback) as (
    error: Error | null,
    address: string,
    family: number,
  ) => void;

  if (isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      return done(new UnsafeUrlError("That URL points inside a private network."), "", 0);
    }
    return done(null, hostname, isIP(hostname));
  }

  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return done(error, "", 0);
    const list = Array.isArray(addresses) ? addresses : [addresses];
    for (const entry of list) {
      if (isPrivateAddress(entry.address)) {
        return done(new UnsafeUrlError("That URL points inside a private network."), "", 0);
      }
    }
    const first = list[0];
    if (!first) return done(new UnsafeUrlError(`Could not resolve ${hostname}.`), "", 0);
    return done(null, first.address, first.family);
  });
}) as unknown as typeof dnsLookup;

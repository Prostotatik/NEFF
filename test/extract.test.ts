import { test } from "node:test";
import assert from "node:assert/strict";

import { htmlToText, htmlTitle, isPrivateAddress, looksLikeUrl } from "../lib/extract.ts";

// --- the SSRF guard --------------------------------------------------------
// A pasted URL is untrusted input that makes our server open a connection, so
// these are the tests that matter most in this file.

test("loopback, private and link-local IPv4 are refused", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud instance metadata
    "100.64.0.1", // carrier-grade NAT
    "0.0.0.0",
    "224.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(address), true, `${address} should be refused`);
  }
});

test("ordinary public IPv4 is allowed", () => {
  for (const address of ["8.8.8.8", "1.1.1.1", "185.15.59.224", "172.15.0.1", "172.32.0.1"]) {
    assert.equal(isPrivateAddress(address), false, `${address} should be allowed`);
  }
});

test("IPv6 loopback is refused however it is written", () => {
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("0:0:0:0:0:0:0:1"), true);
  assert.equal(isPrivateAddress("0000:0000:0000:0000:0000:0000:0000:0001"), true);
});

test("IPv6 unique-local and link-local ranges are refused across the whole prefix", () => {
  assert.equal(isPrivateAddress("fc00::1"), true);
  assert.equal(isPrivateAddress("fd12:3456::1"), true);
  assert.equal(isPrivateAddress("fe80::1"), true);
  assert.equal(isPrivateAddress("febf::1"), true, "fe80::/10 runs to febf, not just fe80");
  assert.equal(isPrivateAddress("fec0::1"), false, "fec0 is outside link-local");
});

test("an IPv4-mapped IPv6 address is judged on the IPv4 it carries", () => {
  assert.equal(isPrivateAddress("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateAddress("::ffff:169.254.169.254"), true);
  assert.equal(isPrivateAddress("::ffff:8.8.8.8"), false);
});

test("public IPv6 is allowed", () => {
  assert.equal(isPrivateAddress("2001:4860:4860::8888"), false);
});

// --- input routing ---------------------------------------------------------

test("a URL is recognised, and a sentence containing a word with a dot is not", () => {
  assert.equal(looksLikeUrl("https://example.com/a/b"), true);
  assert.equal(looksLikeUrl("http://example.com"), true);
  assert.equal(looksLikeUrl("The site example.com said so."), false);
  assert.equal(looksLikeUrl("Vitamin C prevents colds."), false);
});

// --- text extraction -------------------------------------------------------

test("scripts, styles and markup are stripped, paragraphs are kept", () => {
  const html = `<html><head><title>A headline</title><style>p{color:red}</style></head>
    <body><script>alert(1)</script><p>First sentence.</p><p>Second sentence.</p></body></html>`;
  const text = htmlToText(html);
  assert.ok(!text.includes("alert"), "script contents must not survive");
  assert.ok(!text.includes("color:red"), "style contents must not survive");
  assert.match(text, /First sentence\./);
  assert.match(text, /Second sentence\./);
});

test("entities are decoded so the claim reads as written", () => {
  assert.equal(htmlToText("<p>Tom &amp; Jerry said &quot;no&quot;</p>"), 'Tom & Jerry said "no"');
});

test("the page title is recovered for attribution", () => {
  assert.equal(htmlTitle("<html><head><title>Streisand effect - Wikipedia</title></head></html>"), "Streisand effect - Wikipedia");
});

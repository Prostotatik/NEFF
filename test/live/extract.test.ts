/**
 * Live checks that a pasted URL can actually be read, and that a hostile one
 * cannot.
 *
 * These make real network requests on purpose. The bug that motivated this file
 * was invisible to every unit test: the SSRF guard installs a custom DNS lookup
 * on the socket, Node calls that lookup with `{ all: true }` because
 * happy-eyeballs is on by default, and returning the single-address form there
 * made *every* URL in the product fail while all the unit tests stayed green.
 * Only a real connection catches it.
 *
 * Run with: npm run test:live
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { UnsafeUrlError, fetchPage } from "../../lib/extract.ts";

test("a real public page can be fetched and reduced to text", async () => {
  const page = await fetchPage("https://en.wikipedia.org/wiki/Streisand_effect");
  assert.ok(page.text.length > 500, `expected substantial text, got ${page.text.length} chars`);
  assert.match(page.title, /Streisand/i);
  assert.ok(!page.text.includes("<script"), "markup must not survive extraction");
});

test("a page that redirects is followed to its destination", async () => {
  // http -> https is the most common redirect a pasted link will hit.
  const page = await fetchPage("http://en.wikipedia.org/wiki/Streisand_effect");
  assert.ok(page.text.length > 500);
  assert.match(page.url, /^https:/);
});

test("localhost is refused even though it resolves", async () => {
  await assert.rejects(
    () => fetchPage("http://localhost:3000/"),
    (error: unknown) => {
      assert.ok(error instanceof UnsafeUrlError);
      assert.match(error.message, /private network/i);
      return true;
    },
  );
});

test("the cloud metadata address is refused", async () => {
  await assert.rejects(
    () => fetchPage("http://169.254.169.254/latest/meta-data/"),
    (error: unknown) => {
      assert.ok(error instanceof UnsafeUrlError);
      assert.match(error.message, /private network/i);
      return true;
    },
  );
});

test("a login-walled host returns an instruction, not a failure", async () => {
  await assert.rejects(
    () => fetchPage("https://x.com/someone/status/123"),
    (error: unknown) => {
      assert.ok(error instanceof UnsafeUrlError);
      assert.match(error.message, /paste that instead/i);
      return true;
    },
  );
});

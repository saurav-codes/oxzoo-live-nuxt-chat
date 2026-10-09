import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIP, decodeHistory, isLoopback, parseMessage, TEXT_MAX } from "../server/lib/chat.ts";

test("parseMessage validates name and text", () => {
  assert.deepEqual(parseMessage('{"name":" ana ","text":" hi "}', false), { ok: true, name: "ana", text: "hi" });
  assert.equal(parseMessage("nope", false).ok, false);
  assert.equal(parseMessage('{"name":"","text":"hi"}', false).ok, false);
  assert.equal(parseMessage('{"name":"<b>","text":"hi"}', false).ok, false);
  assert.equal(parseMessage(JSON.stringify({ name: "a".repeat(33), text: "hi" }), false).ok, false);
  assert.equal(parseMessage('{"name":"ana","text":"   "}', false).ok, false);
  assert.equal(parseMessage(JSON.stringify({ name: "ana", text: "x".repeat(TEXT_MAX) }), false).ok, true);
  assert.deepEqual(parseMessage(JSON.stringify({ name: "ana", text: "x".repeat(TEXT_MAX + 1) }), false), { ok: false, error: "text is longer than 500 characters" });
  assert.equal(parseMessage('{"name":"ana","text":"a\\u0007b"}', false).ok, false);
  assert.deepEqual(parseMessage('{"name":"zoo-probe","text":"x"}', false), { ok: false, error: "name is reserved" });
  assert.equal(parseMessage('{"name":"zoo-probe","text":"x"}', true).ok, true);
});

test("client IP and loopback", () => {
  assert.equal(clientIP("1.2.3.4, 5.6.7.8", "127.0.0.1"), "5.6.7.8");
  assert.equal(clientIP(undefined, "10.0.0.1"), "10.0.0.1");
  assert.ok(isLoopback(undefined, "::1"));
  assert.ok(!isLoopback("1.2.3.4", "127.0.0.1"));
  assert.ok(!isLoopback(undefined, "10.0.0.1"));
});

test("history decodes oldest first and skips junk", () => {
  const m = (id: string) => JSON.stringify({ id, name: "a", text: "t", at: "2026-01-01T00:00:00Z" });
  assert.deepEqual(decodeHistory([m("2"), "junk", m("1")]).map((x) => x.id), ["1", "2"]);
});

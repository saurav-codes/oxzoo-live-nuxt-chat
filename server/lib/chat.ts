// Chat rules: message shape, input validation, client IP. No framework imports, so tests run in plain Node.
import { randomUUID } from "node:crypto";

export const HISTORY_KEY = "chat:history";
export const CHANNEL = "chat:room";
export const HISTORY_MAX = 100;
export const TEXT_MAX = 500;
export const MAX_STREAMS = 100;
export const HEARTBEAT_MS = 15_000;
export const PROBE_NAME = "zoo-probe";

const NAME_RE = /^[\p{L}\p{N} _.-]{1,32}$/u;
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f]/;

export interface Message {
  id: string;
  name: string;
  text: string;
  at: string;
}

export type Parsed = { ok: true; name: string; text: string } | { ok: false; error: string };

// parseMessage validates a POST body. The probe name is reserved for the app's own loopback self check.
export function parseMessage(raw: string, fromLoopback: boolean): Parsed {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, error: "body must be JSON {\"name\": ..., \"text\": ...}" };
  }
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be a JSON object" };
  const { name, text } = body as Record<string, unknown>;
  if (typeof name !== "string" || !NAME_RE.test(name.trim())) return { ok: false, error: "name must be 1 to 32 letters, digits, spaces, _ . -" };
  if (typeof text !== "string") return { ok: false, error: "text must be a string" };
  const t = text.trim();
  if (t.length === 0) return { ok: false, error: "text is empty" };
  if ([...t].length > TEXT_MAX) return { ok: false, error: `text is longer than ${TEXT_MAX} characters` };
  if (CONTROL_RE.test(t)) return { ok: false, error: "text has control characters" };
  if (name.trim() === PROBE_NAME && !fromLoopback) return { ok: false, error: "name is reserved" };
  return { ok: true, name: name.trim(), text: t };
}

export function newMessage(name: string, text: string, now = new Date()): Message {
  return { id: randomUUID(), name, text, at: now.toISOString().replace(/\.\d{3}Z$/, "Z") };
}

// clientIP takes the last X-Forwarded-For entry (the one the local proxy added), else the socket address.
export function clientIP(xff: string | undefined, remote: string | undefined): string {
  const last = xff?.split(",").pop()?.trim();
  return last || remote || "unknown";
}

export function isLoopback(xff: string | undefined, remote: string | undefined): boolean {
  return !xff && (remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1");
}

// decodeHistory turns LRANGE output (newest first) into oldest-first messages, skipping bad entries.
export function decodeHistory(rows: string[]): Message[] {
  const out: Message[] = [];
  for (const row of rows) {
    try {
      const m = JSON.parse(row) as Message;
      if (typeof m.id === "string" && typeof m.text === "string") out.push(m);
    } catch {
      // A malformed entry is skipped rather than breaking the page.
    }
  }
  return out.reverse();
}

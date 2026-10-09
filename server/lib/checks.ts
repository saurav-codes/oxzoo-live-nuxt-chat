// Probe checks: Redis round trip, pub/sub round trip, and an SSE self check over loopback.
import { randomUUID } from "node:crypto";
import { HISTORY_KEY, PROBE_NAME } from "./chat.ts";
import { forget, newRedis, redis } from "./redis.ts";
import { type AppInfo, type CheckSpec, env, readJSON } from "./zoo.ts";

declare const __BUILT_AT__: string;

export const info: AppInfo = {
  name: "nuxt-chat",
  stack: "Nuxt 4 SSR",
  build: { built_at: typeof __BUILT_AT__ === "string" ? __BUILT_AT__ : undefined },
};

function abortable<T>(signal: AbortSignal, work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    work.then(resolve, reject);
  });
}

const redisCheck: CheckSpec = {
  id: "redis",
  label: "Redis SET, GET, DEL",
  env: ["REDIS_URL"],
  async run(ctx) {
    const r = redis();
    const key = `zoo:probe:${randomUUID()}`;
    const value = randomUUID();
    await abortable(ctx.signal, r.set(key, value, "PX", 10_000));
    const back = await abortable(ctx.signal, r.get(key));
    await abortable(ctx.signal, r.del(key));
    if (back !== value) throw new Error("read back a different value");
    const len = await abortable(ctx.signal, r.llen(HISTORY_KEY));
    return `round trip ok, ${len} messages in history`;
  },
};

const pubsubCheck: CheckSpec = {
  id: "pubsub",
  label: "Redis pub/sub round trip within 2 s",
  env: ["REDIS_URL"],
  async run(ctx) {
    const sub = newRedis();
    const channel = `zoo:probe:${randomUUID()}`;
    const token = randomUUID();
    const t0 = Date.now();
    try {
      const got = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no message within 2 s")), 2000);
        sub.on("message", (ch: string, msg: string) => {
          if (ch === channel && msg === token) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      await abortable(ctx.signal, sub.subscribe(channel));
      const receivers = await abortable(ctx.signal, redis().publish(channel, token));
      await abortable(ctx.signal, got);
      return `published to ${receivers} subscriber, received in ${Date.now() - t0} ms`;
    } finally {
      sub.disconnect();
    }
  },
};

// readUntil reads an SSE body until a data line contains needle.
async function readUntil(body: ReadableStream<Uint8Array>, needle: string, onOpen: () => Promise<void>): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let opened = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error("stream ended before the message arrived");
      buf += dec.decode(value, { stream: true });
      if (!opened && buf.includes("event: ready")) {
        opened = true;
        await onOpen();
      }
      if (buf.includes(needle)) return;
      if (buf.length > 256 * 1024) throw new Error("stream sent too much without the message");
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const sseCheck: CheckSpec = {
  id: "sse",
  label: "Own SSE stream sees a posted message",
  env: ["PORT", "REDIS_URL"],
  async run(ctx) {
    const base = `http://127.0.0.1:${env("PORT")}`;
    const token = `probe ${randomUUID()}`;
    const t0 = Date.now();
    const res = await fetch(`${base}/api/chat/stream`, { signal: ctx.signal });
    if (res.status !== 200 || !res.body) throw new Error(`stream answered ${res.status}`);
    let stored = "";
    await readUntil(res.body, token, async () => {
      const p = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: PROBE_NAME, text: token }),
        signal: ctx.signal,
      });
      const out = await readJSON(p);
      if (p.status !== 201) throw new Error(`POST /api/chat answered ${p.status}: ${out.error ?? ""}`);
      stored = JSON.stringify(out.message);
    });
    if (stored) await forget(stored);
    return `opened stream, posted, saw it in ${Date.now() - t0} ms, removed it from history`;
  },
};

export const checks = [redisCheck, pubsubCheck, sseCheck];

// One command connection and one subscriber connection per process. The subscriber fans
// chat:room messages out to the SSE streams open on this process.
import { Redis } from "ioredis";
import { CHANNEL, HISTORY_KEY, HISTORY_MAX, type Message } from "./chat.ts";
import { env } from "./zoo.ts";

const OPTS = { connectTimeout: 5000, commandTimeout: 5000, maxRetriesPerRequest: 1 };

let cmd: Redis | undefined;
let sub: Redis | undefined;
const listeners = new Set<(raw: string) => void>();

export function redisURL(): string {
  const url = env("REDIS_URL");
  if (!url) throw new Error("REDIS_URL is not set");
  return url;
}

export function newRedis(): Redis {
  const r = new Redis(redisURL(), OPTS);
  r.on("error", (e) => console.error("redis:", e.message));
  return r;
}

export function redis(): Redis {
  cmd ??= newRedis();
  return cmd;
}

export async function listen(fn: (raw: string) => void): Promise<() => void> {
  if (!sub) {
    const s = newRedis();
    s.on("message", (channel: string, raw: string) => {
      if (channel === CHANNEL) for (const l of listeners) l(raw);
    });
    sub = s;
    await s.subscribe(CHANNEL);
  }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function history(): Promise<string[]> {
  return redis().lrange(HISTORY_KEY, 0, HISTORY_MAX - 1);
}

// post stores the message in the capped history and publishes it to every process.
export async function post(m: Message): Promise<string> {
  const raw = JSON.stringify(m);
  const results = await redis().multi().lpush(HISTORY_KEY, raw).ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1).publish(CHANNEL, raw).exec();
  const failed = results?.find(([err]) => err);
  if (!results || failed) throw failed?.[0] ?? new Error("transaction aborted");
  return raw;
}

export async function forget(raw: string): Promise<void> {
  await redis().lrem(HISTORY_KEY, 0, raw);
}

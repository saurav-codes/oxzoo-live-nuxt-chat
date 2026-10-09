import { clientIP, isLoopback, newMessage, parseMessage } from "../../lib/chat.ts";
import { post } from "../../lib/redis.ts";
import { RateLimit, readCapped } from "../../lib/zoo.ts";

const limit = new RateLimit(5, 10_000);

export default defineEventHandler(async (event) => {
  const xff = getRequestHeader(event, "x-forwarded-for");
  const remote = event.node.req.socket.remoteAddress;
  if (!limit.allow(clientIP(xff, remote))) {
    setResponseStatus(event, 429);
    return { error: "slow down: 5 messages per 10 s" };
  }
  let raw: string;
  try {
    raw = new TextDecoder().decode(await readCapped(toWebRequest(event).body, 2048));
  } catch {
    setResponseStatus(event, 413);
    return { error: "body larger than 2048 bytes" };
  }
  const parsed = parseMessage(raw, isLoopback(xff, remote));
  if (!parsed.ok) {
    setResponseStatus(event, 400);
    return { error: parsed.error };
  }
  const message = newMessage(parsed.name, parsed.text);
  try {
    await post(message);
  } catch (e) {
    console.error("chat post:", (e as Error).message);
    setResponseStatus(event, 503);
    return { error: "chat backend unavailable" };
  }
  setResponseStatus(event, 201);
  return { message };
});

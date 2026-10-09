import { HEARTBEAT_MS, MAX_STREAMS } from "../../lib/chat.ts";
import { listen } from "../../lib/redis.ts";

let open = 0;

export default defineEventHandler(async (event) => {
  if (open >= MAX_STREAMS) {
    setResponseStatus(event, 503);
    return { error: `stream limit of ${MAX_STREAMS} reached, try again later` };
  }
  open++;
  const stream = createEventStream(event);
  let stop = () => {};
  const beat = setInterval(() => void stream.push({ event: "ping", data: "" }), HEARTBEAT_MS);
  stream.onClosed(() => {
    clearInterval(beat);
    stop();
    open--;
  });
  try {
    stop = await listen((raw) => void stream.push({ event: "message", data: raw }));
  } catch (e) {
    console.error("chat stream:", (e as Error).message);
    await stream.close();
    setResponseStatus(event, 503);
    return { error: "chat backend unavailable" };
  }
  void stream.push({ event: "ready", data: String(open) });
  return stream.send();
});

import { decodeHistory } from "../../lib/chat.ts";
import { history } from "../../lib/redis.ts";

export default defineEventHandler(async () => ({ messages: decodeHistory(await history()) }));

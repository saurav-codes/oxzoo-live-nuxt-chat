import { health, json, preflight } from "../../lib/zoo.ts";
import { info } from "../../lib/checks.ts";

export default defineEventHandler((event) => {
  const req = toWebRequest(event);
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "GET" && req.method !== "HEAD") return json(req, 405, { error: "method not allowed" });
  return json(req, 200, health(info));
});

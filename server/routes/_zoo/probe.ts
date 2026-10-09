import { json, preflight, probe, variable } from "../../lib/zoo.ts";
import { checks, info } from "../../lib/checks.ts";

export default defineEventHandler((event) => {
  const req = toWebRequest(event);
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "GET" && req.method !== "HEAD") return json(req, 405, { error: "method not allowed" });
  return probe(req, info, checks, [variable("REDIS_URL", "service"), variable("ZOO_PANEL_ORIGIN", "plain", { show: true })]);
});

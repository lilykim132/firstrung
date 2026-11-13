import { redis, KEYS, parse, validUid, noStore, allow } from "../lib/store.js";
import { isFounder } from "../lib/auth.js";

// Founder-only. Send the password in the `x-founder-password` header.
// GET   /api/admin                    -> { requests: [...], feedback: [...] }
// PATCH /api/admin { uid, status }    -> update a request's status
const STATUSES = ["New", "Matching", "Matched", "Done"];

export default async function handler(req, res) {
  if (!(await allow(req, "admin", 300))) return res.status(429).json({ error: "Too many requests." });
  if (!isFounder(req)) return res.status(401).json({ error: "Wrong password." });
  if (!redis) return noStore(res);

  if (req.method === "GET") {
    const [reqs, fb] = await Promise.all([redis.hgetall(KEYS.requests), redis.hgetall(KEYS.feedback)]);
    const requests = Object.entries(reqs || {}).map(([uid, v]) => ({ uid, ...(parse(v) || {}) }));
    const feedback = Object.entries(fb || {}).flatMap(([uid, v]) => ((parse(v) || {}).sessions || []).map(s => ({ ...s, who: uid })));
    return res.json({ requests, feedback });
  }

  if (req.method === "PATCH") {
    const { uid, status } = req.body || {};
    if (!validUid(uid) || !STATUSES.includes(status)) return res.status(400).json({ error: "Bad update" });
    const r = parse(await redis.hget(KEYS.requests, uid));
    if (!r) return res.status(404).json({ error: "Request not found" });
    r.status = status;
    r.updated = new Date().toISOString();
    await redis.hset(KEYS.requests, { [uid]: JSON.stringify(r) });
    return res.json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}

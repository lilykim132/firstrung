import { redis, KEYS, parse, validUid, clip, noStore, allow } from "../lib/store.js";

// GET  /api/requests?uid=...   -> the visitor's own request (status only matters)
// POST /api/requests           -> create or replace the visitor's request
export default async function handler(req, res) {
  if (!redis) return noStore(res);

  if (req.method === "GET") {
    const uid = String(req.query.uid || "");
    if (!validUid(uid)) return res.status(400).json({ error: "Bad id" });
    const r = parse(await redis.hget(KEYS.requests, uid));
    return res.json(r ? { kind: r.kind, status: r.status } : null);
  }

  if (req.method === "POST") {
    if (!(await allow(req, "req", 20))) return res.status(429).json({ error: "Too many requests. Try again later." });
    const b = req.body || {};
    if (!validUid(b.uid)) return res.status(400).json({ error: "Bad id" });
    const data = {
      name: clip(b.name, 120), email: clip(b.email, 200), year: clip(b.year, 40), field: clip(b.field, 200),
      kind: clip(b.kind, 60), companies: clip(b.companies, 300), when: clip(b.when, 300),
      notes: clip(b.notes, 1500), firstGen: !!b.firstGen,
    };
    if (!data.name || !/^\S+@\S+\.\S+$/.test(data.email) || !data.field) {
      return res.status(400).json({ error: "Add your name, a valid email and your target role." });
    }
    const prev = parse(await redis.hget(KEYS.requests, b.uid));
    const record = { ...data, uid: b.uid, status: "New", created: new Date().toISOString(), previous: prev ? prev.created : undefined };
    await redis.hset(KEYS.requests, { [b.uid]: JSON.stringify(record) });
    return res.json({ kind: record.kind, status: record.status });
  }

  res.status(405).json({ error: "Method not allowed" });
}

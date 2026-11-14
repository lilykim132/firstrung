import { redis, KEYS, parse, validUid, clip, noStore, allow } from "../lib/store.js";

// POST /api/feedback  { uid, entry: {at, role, format, year, overall, useful, wtp} }
// One entry per session; re-sending the same `at` replaces it.
const WTP = ["Only if free", "Up to $10", "Up to $25", "Over $25"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!redis) return noStore(res);
  if (!(await allow(req, "fb", 60))) return res.status(429).json({ error: "Too many requests." });

  const { uid, entry = {} } = req.body || {};
  if (!validUid(uid)) return res.status(400).json({ error: "Bad id" });
  const at = clip(entry.at, 40);
  if (!at || isNaN(Date.parse(at))) return res.status(400).json({ error: "Bad session time" });

  const useful = Number(entry.useful);
  const clean = {
    at, role: clip(entry.role, 120), format: entry.format === "recorded" ? "recorded" : "live",
    year: clip(entry.year, 40),
    overall: Number.isFinite(Number(entry.overall)) && entry.overall !== null ? Math.max(0, Math.min(100, Math.round(Number(entry.overall)))) : null,
    useful: useful >= 1 && useful <= 5 ? Math.round(useful) : null,
    wtp: WTP.includes(entry.wtp) ? entry.wtp : null,
  };

  const prev = parse(await redis.hget(KEYS.feedback, uid)) || { sessions: [] };
  const sessions = (prev.sessions || []).filter(s => s.at !== at).concat([clean]).slice(-25);
  await redis.hset(KEYS.feedback, { [uid]: JSON.stringify({ sessions, updated: new Date().toISOString() }) });
  res.json({ ok: true });
}

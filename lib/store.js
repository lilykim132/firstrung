import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;

export const KEYS = {
  requests: "fr:requests", // hash: uid -> request JSON
  feedback: "fr:feedback", // hash: uid -> { sessions: [...] }
};

export function parse(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

const UID_RE = /^[A-Za-z0-9-]{16,64}$/;
export function validUid(uid) {
  return typeof uid === "string" && UID_RE.test(uid);
}

export function clip(v, n) {
  return String(v ?? "").slice(0, n);
}

export function noStore(res) {
  res.status(503).json({ error: "Storage isn't connected yet. Add Upstash Redis to this Vercel project." });
}

/** Simple fixed-window limiter per IP. Returns true when the call is allowed. */
export async function allow(req, bucket, perHour) {
  if (!redis) return true;
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const key = `fr:rl:${bucket}:${ip}:${Math.floor(Date.now() / 3600000)}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 3700);
  return n <= perHour;
}

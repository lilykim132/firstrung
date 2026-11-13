import { timingSafeEqual } from "node:crypto";

export function isFounder(req) {
  const expected = process.env.FOUNDER_PASSWORD || "";
  const given = String(req.headers["x-founder-password"] || "");
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

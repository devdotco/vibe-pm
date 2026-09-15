import { NextRequest } from "next/server";
import crypto from "crypto";

/**
 * `===` on a secret leaks how many leading bytes matched through how long the
 * comparison took. Over a network that timing difference is measurable, and
 * both checks below gate service-to-service routes that touch every
 * organization's data — so both go through this instead.
 *
 * `timingSafeEqual` throws if the two buffers differ in length, which a naive
 * wrapper would let an attacker turn into a 500 (or worse, a distinguishable
 * error path) just by sending a header of the wrong length. Comparing lengths
 * first and returning `false` keeps this a plain yes/no.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireServiceAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.INTER_SERVICE_SECRET;
  if (!secret) return false;
  return timingSafeEqual(auth ?? "", `Bearer ${secret}`);
}

export function requireCronAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(auth ?? "", `Bearer ${secret}`);
}

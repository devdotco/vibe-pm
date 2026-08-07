import { NextRequest } from "next/server";

export function requireServiceAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.INTER_SERVICE_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export function requireCronAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

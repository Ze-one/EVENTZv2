import crypto from "node:crypto";

// Local development works without provisioning secrets. Production must supply
// stable keys so sessions and QR signatures survive instance restarts.
const localKey =
  process.env.NODE_ENV !== "production" && !process.env.VERCEL
    ? crypto.randomBytes(32).toString("hex")
    : "";
export function sessionSecret() {
  const key =
    process.env.EVENTZ_SESSION_SECRET ||
    process.env.PASS_QR_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    localKey;
  if (!key) throw new Error("EVENTZ_SESSION_SECRET is required in production.");
  return key;
}
export function passSecret() {
  const key =
    process.env.PASS_QR_SIGNING_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.EVENTZ_LOCAL_SIGNING_KEY ||
    localKey;
  if (!key)
    throw new Error("PASS_QR_SIGNING_SECRET is required in production.");
  return key;
}

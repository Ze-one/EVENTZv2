import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function passwordMatches(password: string, stored: string) {
  try {
    const [algorithm, salt, hash] = stored.split(":");
    const expected =
      algorithm === "scrypt"
        ? Buffer.from(hash, "hex")
        : Buffer.from(stored, "hex");
    const actual =
      algorithm === "scrypt"
        ? scryptSync(password, salt, 64)
        : createHash("sha256").update(password).digest();
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

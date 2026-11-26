import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(derive);
export const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
export const newToken = () => randomBytes(32).toString("hex");
export const validToken = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function validPassword(value) {
  return (
    typeof value === "string" && value.length >= 12 && value.length <= 128 && !value.includes("\0")
  );
}
export async function hashPassword(value) {
  if (!validPassword(value)) throw new Error("Use uma senha com 12 a 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(value, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt}$${key.toString("hex")}`;
}
export async function checkPassword(value, encoded) {
  // Same expensive operation for unknown users, without accepting arbitrary cost parameters.
  const fallback = "scrypt$16384$8$1$00000000000000000000000000000000$" + "00".repeat(32);
  const fields = String(encoded || fallback).split("$");
  const valid =
    fields.length === 6 &&
    fields.slice(0, 4).join("$") === "scrypt$16384$8$1" &&
    /^[a-f0-9]{32}$/.test(fields[4]) &&
    /^[a-f0-9]{64}$/.test(fields[5]);
  const record = valid ? fields : fallback.split("$");
  const key = await scrypt(String(value || "").slice(0, 128), record[4], 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return Boolean(
    encoded &&
    valid &&
    typeof value === "string" &&
    value.length <= 128 &&
    timingSafeEqual(key, Buffer.from(record[5], "hex")),
  );
}


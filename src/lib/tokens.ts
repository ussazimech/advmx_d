import crypto from "crypto";

/** 6-digit numeric code shown on the display for pairing, e.g. "482913" */
export function generatePairingCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Long random secret the display stores permanently and authenticates with */
export function generateDeviceToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

import { createHmac, timingSafeEqual } from "crypto";
import { env } from "./env";

const WINDOW_SECS = 28800; // 8-hour windows

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// Returns { tok, w } — permanent tokens (w is always 0)
export function generateToken(table: string): { tok: string; w: number } {
  const w = 0;
  const tok = hmacHex(env.QR_SECRET, `table=${table}&w=${w}`).slice(0, 16);
  return { tok, w };
}

export function verifyToken(table: string, w: string, tok: string): boolean {
  if (w !== "0") return false;
  const expected = hmacHex(env.QR_SECRET, `table=${table}&w=0`).slice(0, 16);
  return expected.length === tok.length && safeEqual(expected, tok);
}

function base64urlEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signTableCookie(table: string): string {
  const exp = Math.floor(Date.now() / 1000) + WINDOW_SECS;
  const payload = base64urlEncode(JSON.stringify({ table, exp }));
  const sig = hmacHex(env.COOKIE_SECRET, payload);
  return `${payload}.${sig}`;
}

export function verifyTableCookie(raw: string): string | null {
  try {
    const dotIdx = raw.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payload = raw.slice(0, dotIdx);
    const sig = raw.slice(dotIdx + 1);
    const expectedSig = hmacHex(env.COOKIE_SECRET, payload);
    if (sig.length !== expectedSig.length || !safeEqual(expectedSig, sig)) return null;
    const data = JSON.parse(base64urlDecode(payload)) as { table: string; exp: number };
    if (Math.floor(Date.now() / 1000) > data.exp) return null;
    if (typeof data.table !== "string" || data.table.length === 0 || data.table.length > 50) return null;
    return data.table;
  } catch {
    return null;
  }
}

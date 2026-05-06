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

// Returns { tok, w } — both must be embedded in the QR URL
export function generateToken(table: number): { tok: string; w: number } {
  const w = Math.floor(Date.now() / 1000 / WINDOW_SECS);
  const message = `table=${table}&w=${w}`;
  const tok = hmacHex(env.QR_SECRET, message).slice(0, 16);
  return { tok, w };
}

// Accepts w as a string from the URL param
export function verifyToken(table: number, w: string, tok: string): boolean {
  const wNum = parseInt(w, 10);
  if (!Number.isInteger(wNum)) return false;
  const currentW = Math.floor(Date.now() / 1000 / WINDOW_SECS);
  // Allow current window and the previous one (grace period)
  for (const validW of [currentW, currentW - 1]) {
    const expected = hmacHex(env.QR_SECRET, `table=${table}&w=${validW}`).slice(0, 16);
    if (wNum === validW && safeEqual(expected, tok.padEnd(expected.length, " ").slice(0, expected.length))) {
      // Use timingSafeEqual-safe comparison: compare full expected vs tok
      if (expected.length === tok.length && safeEqual(expected, tok)) return true;
    }
  }
  return false;
}

function base64urlEncode(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function base64urlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

export function signTableCookie(table: number): string {
  const exp = Math.floor(Date.now() / 1000) + WINDOW_SECS;
  const payload = base64urlEncode(JSON.stringify({ table, exp }));
  const sig = hmacHex(env.COOKIE_SECRET, payload);
  return `${payload}.${sig}`;
}

export function verifyTableCookie(raw: string): number | null {
  try {
    const dotIdx = raw.lastIndexOf(".");
    if (dotIdx === -1) return null;
    const payload = raw.slice(0, dotIdx);
    const sig = raw.slice(dotIdx + 1);
    const expectedSig = hmacHex(env.COOKIE_SECRET, payload);
    if (sig.length !== expectedSig.length || !safeEqual(expectedSig, sig)) return null;
    const data = JSON.parse(base64urlDecode(payload)) as { table: number; exp: number };
    if (Math.floor(Date.now() / 1000) > data.exp) return null;
    if (!Number.isInteger(data.table) || data.table < 1 || data.table > 999) return null;
    return data.table;
  } catch {
    return null;
  }
}

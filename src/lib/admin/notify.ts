import { redirect } from "next/navigation";

export function notifyOk(path: string, label: string): never {
  redirect(`${path}?ok=1&label=${encodeURIComponent(label)}`);
}

export function notifyErr(path: string, label: string): never {
  redirect(`${path}?err=1&label=${encodeURIComponent(label)}`);
}

export const ADMIN_TOAST_EVENT = "admin:toast";

export type AdminToastDetail = { kind: "ok" | "err"; label: string };

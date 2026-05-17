"use client";

import { ADMIN_TOAST_EVENT, type AdminToastDetail } from "./notify";

export function clientToast(detail: AdminToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AdminToastDetail>(ADMIN_TOAST_EVENT, { detail }));
}

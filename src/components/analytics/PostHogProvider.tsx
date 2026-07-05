"use client";

/**
 * Initializes posthog-js on the public menu only. Mounted in the public locale
 * layout — NOT in the admin/dashboard tree, so staff activity is never tracked.
 *
 * No-ops entirely when NEXT_PUBLIC_POSTHOG_KEY is absent, so the menu runs
 * unchanged without analytics configured.
 *
 * Registers `table_number` and `locale` as super-properties so every captured
 * event (and autocaptured pageview) is attributable without per-call plumbing.
 */
import { useEffect } from "react";
import posthog from "posthog-js";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

export function PostHogProvider({
  locale,
  tableNumber,
}: {
  locale: string;
  tableNumber?: string | null;
}) {
  useEffect(() => {
    if (!KEY) return;
    if (!posthog.__loaded) {
      posthog.init(KEY, {
        api_host: HOST,
        person_profiles: "identified_only",
        // We rely on autocaptured pageviews for session/duration derivation,
        // and our own track.ts events for menu interactions.
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
      });
    }
  }, []);

  // Keep super-properties in sync (table can resolve after mount from session).
  useEffect(() => {
    if (!KEY || !posthog.__loaded) return;
    posthog.register({
      locale,
      ...(tableNumber ? { table_number: tableNumber } : {}),
    });
  }, [locale, tableNumber]);

  return null;
}

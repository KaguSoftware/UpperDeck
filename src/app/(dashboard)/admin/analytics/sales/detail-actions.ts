"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/require-session";
import { getSalesDayDetail, type SalesDayDetail } from "@/lib/analytics/sales";

/**
 * Read side of the sales list's per-day drill-down.
 *
 * Kept out of `actions.ts` (which holds the import/upsert mutations) because this
 * is a lazy READ: the list shows every recorded day, and eagerly loading item rows
 * for all of them would pull thousands of rows to render a table nobody has opened
 * yet. One row expands, one query runs.
 */

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getSalesDayDetailAction(
  entryDate: string
): Promise<{ ok: true; detail: SalesDayDetail } | { ok: false }> {
  const parsed = DateSchema.safeParse(entryDate);
  if (!parsed.success) return { ok: false };

  await requireRole(["owner", "dev"]);
  const detail = await getSalesDayDetail(parsed.data);
  return detail ? { ok: true, detail } : { ok: false };
}

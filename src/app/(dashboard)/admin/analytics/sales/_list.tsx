"use client";

import { DangerButton } from "../../_components";
import { deleteSalesEntry } from "./actions";
import type { SalesEntry } from "@/lib/analytics/sales";

const fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });

export function SalesList({ entries }: { entries: SalesEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="border-2 border-dashed border-green/40 bg-white p-6 text-center text-[12px] text-green/60">
        Bu dönem için kayıtlı satış yok. Yukarıdan elle girin veya Excel yükleyin.
      </div>
    );
  }

  return (
    <div className="border-2 border-green bg-white overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b-2 border-green text-left text-[10px] uppercase tracking-[0.18em] text-green/70">
            <th className="px-4 py-3 font-extrabold">Tarih</th>
            <th className="px-4 py-3 font-extrabold">Satış</th>
            <th className="px-4 py-3 font-extrabold">Kişi</th>
            <th className="px-4 py-3 font-extrabold">Kaynak</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-green/15 last:border-0">
              <td className="px-4 py-2.5 font-bold text-ink">{e.entry_date}</td>
              <td className="px-4 py-2.5 text-ink">{fmt.format(e.total_sales)}</td>
              <td className="px-4 py-2.5 text-ink">{e.covers ?? "—"}</td>
              <td className="px-4 py-2.5">
                <span className="text-[9px] uppercase tracking-[0.16em] font-extrabold text-green/60">
                  {e.source === "excel" ? "Excel" : "Manuel"}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right">
                <form action={deleteSalesEntry}>
                  <input type="hidden" name="id" value={e.id} />
                  <DangerButton>Sil</DangerButton>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  mapImportedItemAction,
  ignoreImportedItemAction,
  restoreImportedItemAction,
} from "./actions";
import type { ImportReview, ImportReviewRow, ReviewStatus } from "@/lib/analytics/import-review";

/**
 * "What did the last import actually do?" — the screen that makes the POS
 * import's three silent heuristics auditable.
 *
 * Every product line from the file lands in one of four buckets, each with the
 * decision it needs:
 *   • TANINMAYAN — kept, but nothing on the menu resembles it. Map it onto a real
 *     item (fuzzy candidates offered) or confirm it isn't a product.
 *   • AYRILAN — the cleaner removed it as a modifier / note / zero-qty line. The
 *     rules are heuristics, so this list exists mainly so a wrongly-removed dish
 *     is VISIBLE and one click away from coming back. It is also where the
 *     modifier demand signal lives ("Mayonezsiz ×43") instead of the bin.
 *   • EŞLEŞEN — matched the menu; nothing to do, collapsed by default.
 *
 * Mapping is permanent: the alias applies to every future import AND renames the
 * rows already stored, so the current range's figures correct themselves.
 */

const tl = new Intl.NumberFormat("tr-TR");
const money = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

const STATUS: Record<ReviewStatus, { label: string; chip: string; hint: string }> = {
  unmatched: {
    label: "Tanınmayan",
    chip: "bg-orange text-white",
    hint: "Menüde karşılığı bulunamadı — eşleştirin ya da ürün değil olarak işaretleyin.",
  },
  modifier: {
    label: "Seçenek satırı",
    chip: "bg-ink text-white",
    hint: "Sipariş seçeneği/ek not gibi görünüyor, satış kalemi sayılmadı. Gerçek bir ürünse geri alın.",
  },
  note: {
    label: "Not satırı",
    chip: "bg-ink/70 text-white",
    hint: "Sipariş notu gibi görünüyor, satış kalemi sayılmadı. Gerçek bir ürünse geri alın.",
  },
  zero: {
    label: "Sıfır adet",
    chip: "bg-green/60 text-white",
    hint: "Adedi sıfır ya da negatif olduğu için alınmadı.",
  },
  matched: { label: "Eşleşen", chip: "bg-green text-white", hint: "" },
};

function trDateTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One reviewable line + its actions. */
function Row({
  row,
  menuOptions,
  busy,
  onMap,
  onIgnore,
  onRestore,
}: {
  row: ImportReviewRow;
  menuOptions: string[];
  busy: boolean;
  onMap: (raw: string, target: string) => void;
  onIgnore: (raw: string) => void;
  onRestore: (raw: string) => void;
}) {
  // Seeded with the strongest fuzzy candidate so the common case is one click.
  const [target, setTarget] = useState(row.suggestions[0]?.name ?? "");
  const meta = STATUS[row.status];
  const dropped = row.status === "modifier" || row.status === "note" || row.status === "zero";
  const done = row.resolution;

  const btn =
    "px-2.5 py-1.5 font-ui font-extrabold text-[10px] tracking-[0.12em] uppercase border-2 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-wait";

  return (
    <li className="flex flex-col gap-2 py-3 border-b border-green/15 last:border-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[13px] font-extrabold text-ink min-w-0 break-words">{row.name}</span>
        <span className={`px-1.5 py-0.5 font-ui font-extrabold text-[9px] tracking-[0.12em] uppercase shrink-0 ${meta.chip}`}>
          {meta.label}
        </span>
        <span className="text-[11px] font-bold text-green/60 tabular-nums shrink-0">
          {tl.format(row.qty)} adet
          {row.revenue > 0 && <> · {money.format(row.revenue)} ₺</>}
          {row.days > 0 && <> · {tl.format(row.days)} gün</>}
        </span>
      </div>

      {done ? (
        <p className="text-[11px] font-bold text-green/60">
          ✓{" "}
          {done.action === "mapped"
            ? `“${done.to}” ile eşleştirildi — sonraki içe aktarmalarda otomatik uygulanır.`
            : done.action === "ignored"
              ? "Ürün değil olarak işaretlendi — analiz dışı bırakıldı."
              : "Ürün olarak geri alındı — sonraki içe aktarmalarda korunacak."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {row.status === "unmatched" ? (
            <>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={busy}
                className="min-w-0 max-w-64 border-2 border-green/40 bg-white px-2 py-1.5 text-[12px] text-ink"
              >
                <option value="">Menü ürünü seç…</option>
                {/* Fuzzy candidates first and labelled, then the full menu — the
                    suggestion is usually right but must never be the only option. */}
                {row.suggestions.length > 0 && (
                  <optgroup label="Önerilen">
                    {row.suggestions.map((s) => (
                      <option key={`s-${s.name}`} value={s.name}>
                        {s.name} ({Math.round(s.score * 100)}%)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="Tüm menü">
                  {menuOptions.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button
                type="button"
                disabled={busy || !target}
                onClick={() => onMap(row.name, target)}
                className={`${btn} bg-green text-white border-green hover:bg-green/90`}
              >
                Eşle
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onIgnore(row.name)}
                className={`${btn} bg-white text-green border-green/40 hover:bg-bg-deep`}
              >
                Ürün değil
              </button>
            </>
          ) : dropped ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onRestore(row.name)}
                className={`${btn} bg-orange text-white border-orange hover:bg-orange/90`}
              >
                Bu bir ürün — geri al
              </button>
              <span className="text-[10px] text-green/50 font-bold">{meta.hint}</span>
            </>
          ) : null}
        </div>
      )}
    </li>
  );
}

function Group({
  title,
  desc,
  rows,
  defaultOpen,
  children,
}: {
  title: string;
  desc: string;
  rows: ImportReviewRow[];
  defaultOpen: boolean;
  children: (row: ImportReviewRow) => React.ReactNode;
}) {
  if (!rows.length) return null;
  return (
    <details open={defaultOpen} className="border-2 border-green/30 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] tracking-[0.18em] font-extrabold text-green uppercase">{title}</span>
        <span className="px-1.5 py-0.5 bg-green text-white font-ui font-extrabold text-[9px] leading-none tabular-nums">
          {rows.length}
        </span>
        <span className="text-[10px] text-green/50 font-bold">{desc}</span>
      </summary>
      <ul className="px-4 pb-2">{rows.map((r) => children(r))}</ul>
    </details>
  );
}

export function ImportReviewPanel({
  review,
  menuOptions,
}: {
  review: ImportReview | null;
  menuOptions: string[];
}) {
  const router = useRouter();
  const [busy, startAction] = useTransition();

  const groups = useMemo(() => {
    const rows = review?.rows ?? [];
    const pending = (r: ImportReviewRow) => !r.resolution;
    return {
      unmatched: rows.filter((r) => r.status === "unmatched" && pending(r)),
      dropped: rows.filter(
        (r) => (r.status === "modifier" || r.status === "note" || r.status === "zero") && pending(r)
      ),
      resolved: rows.filter((r) => r.resolution),
      matched: rows.filter((r) => r.status === "matched" && pending(r)),
    };
  }, [review]);

  if (!review) {
    return (
      <div className="border-2 border-dashed border-green/40 bg-white p-6 text-center text-[12px] text-green/60">
        Henüz içe aktarma yapılmadı. Bir POS raporu yükleyin — hangi satırların ürün sayıldığı, hangilerinin
        ayrıldığı burada listelenecek.
      </div>
    );
  }

  const run = (fn: () => Promise<unknown>) =>
    startAction(async () => {
      await fn();
      router.refresh();
    });

  const renderRow = (row: ImportReviewRow) => (
    <Row
      key={row.name}
      row={row}
      menuOptions={menuOptions}
      busy={busy}
      onMap={(raw, target) => run(() => mapImportedItemAction(raw, target))}
      onIgnore={(raw) => run(() => ignoreImportedItemAction(raw))}
      onRestore={(raw) => run(() => restoreImportedItemAction(raw))}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="border-2 border-green bg-bg-deep px-4 py-3">
        <p className="text-[12px] font-bold text-ink leading-relaxed">
          {trDateTime(review.importedAt)}
          {review.sheet && <> · {review.sheet}</>}
          {review.rangeFrom && (
            <>
              {" "}
              · {review.rangeFrom} → {review.rangeTo}
            </>
          )}
        </p>
        <p className="mt-1 text-[11px] font-bold text-green/70 tabular-nums">
          {tl.format(review.totals.names)} ürün adı · {tl.format(review.totals.matched)} menüyle eşleşti ·{" "}
          <span className={review.totals.unmatched ? "text-orange" : ""}>
            {tl.format(review.totals.unmatched)} tanınmadı
          </span>{" "}
          · {tl.format(review.totals.dropped)} satır ayrıldı
        </p>
        {review.menuSize === 0 && (
          <p className="mt-1 text-[11px] font-bold text-orange">
            Menü okunamadı — bu içe aktarmada hiçbir ad menüyle karşılaştırılamadı.
          </p>
        )}
        {review.droppedDetailTruncated && (
          <p className="mt-1 text-[11px] font-bold text-orange">
            Ayrılan satırların tamamı saklanamadı — “geri al” bazı satırlar için dosyayı yeniden yüklemenizi
            gerektirebilir.
          </p>
        )}
      </div>

      <Group
        title="Tanınmayan Ürünler"
        desc="menüde karşılığı yok — eşleştirin"
        rows={groups.unmatched}
        defaultOpen
      >
        {renderRow}
      </Group>

      <Group
        title="Ayrılan Satırlar"
        desc="seçenek / not / sıfır adet — yanlışsa geri alın"
        rows={groups.dropped}
        defaultOpen={groups.unmatched.length === 0}
      >
        {renderRow}
      </Group>

      <Group title="İşlenenler" desc="bu içe aktarmada verdiğiniz kararlar" rows={groups.resolved} defaultOpen={false}>
        {renderRow}
      </Group>

      <Group title="Menüyle Eşleşenler" desc="işlem gerekmiyor" rows={groups.matched} defaultOpen={false}>
        {renderRow}
      </Group>
    </div>
  );
}

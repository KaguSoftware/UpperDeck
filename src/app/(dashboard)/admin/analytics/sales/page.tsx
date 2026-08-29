import { PageHeader, GhostButton } from "../../_components";
import { requireRole } from "@/lib/auth/require-session";
import { listSalesEntries } from "@/lib/analytics/sales";
import { resolveRange } from "@/lib/analytics/range";
import { parseImportReview, IMPORT_REVIEW_SETTINGS_KEY } from "@/lib/analytics/import-review";
import { canonicalItemName } from "@/lib/analytics/clean-sales";
import { SalesForms } from "./_form";
import { SalesList } from "./_list";
import { ImportReviewPanel } from "./_review";

export const dynamic = "force-dynamic";

export default async function SalesEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const { supabase } = await requireRole(["owner", "dev"]);

  const sp = await searchParams;
  const { range } = resolveRange(sp);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const [entries, reviewResult, menuResult] = await Promise.all([
    // Show a wide window of recent entries regardless of the analytics filter.
    listSalesEntries({ from: "2000-01-01", to: range.to }),
    s.from("settings").select("value").eq("key", IMPORT_REVIEW_SETTINGS_KEY).maybeSingle(),
    // Mapping targets for the review panel. Turkish names only — this is the
    // admin surface, and offering both locales would double the list with pairs
    // that resolve to the same product anyway.
    s.from("menu_items").select("name_tr").order("name_tr"),
  ]);

  const review = parseImportReview(reviewResult.data?.value);
  const menuOptions = [
    ...new Set(
      ((menuResult.data ?? []) as { name_tr: string }[])
        .map((r) => canonicalItemName(r.name_tr ?? ""))
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "tr"));

  return (
    <>
      <PageHeader
        title="Gerçek Satışlar"
        subtitle="POS / kasa satışlarını girin — menü etkileşimiyle karşılaştırılır"
        action={<GhostButton href="/admin/analytics">← Analitik</GhostButton>}
      />
      <SalesForms />

      {/* The import's own audit trail: what became a sale, what didn't, and why.
          Sits directly under the upload form because it is that form's output. */}
      <h2 className="font-bowlby text-[18px] text-green uppercase mb-1">İçe Aktarma Kontrolü</h2>
      <p className="text-[11px] text-green/70 mb-3 max-w-2xl leading-relaxed">
        Son içe aktarmada her ürün adına ne olduğunu gösterir. Menüde bulunamayan adları gerçek ürünle
        eşleştirin (eşleştirme kalıcıdır ve mevcut kayıtları da düzeltir), ürün olmayanları işaretleyin,
        yanlışlıkla ayrılmış bir ürünü geri alın.
      </p>
      <div className="mb-8">
        <ImportReviewPanel review={review} menuOptions={menuOptions} />
      </div>

      <h2 className="font-bowlby text-[18px] text-green uppercase mb-3">Kayıtlı Satışlar</h2>
      <SalesList entries={entries} />
    </>
  );
}

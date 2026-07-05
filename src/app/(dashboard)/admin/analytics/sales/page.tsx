import { PageHeader, GhostButton } from "../../_components";
import { requireRole } from "@/lib/auth/require-session";
import { listSalesEntries } from "@/lib/analytics/sales";
import { resolveRange } from "@/lib/analytics/range";
import { SalesForms } from "./_form";
import { SalesList } from "./_list";

export const dynamic = "force-dynamic";

export default async function SalesEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireRole("dev");

  const sp = await searchParams;
  const { range } = resolveRange(sp);
  // Show a wide window of recent entries regardless of the analytics filter.
  const entries = await listSalesEntries({ from: "2000-01-01", to: range.to });

  return (
    <>
      <PageHeader
        title="Gerçek Satışlar"
        subtitle="POS / kasa satışlarını girin — menü etkileşimiyle karşılaştırılır"
        action={<GhostButton href="/admin/analytics">← Analitik</GhostButton>}
      />
      <SalesForms />
      <h2 className="font-bowlby text-[18px] text-green uppercase mb-3">Kayıtlı Satışlar</h2>
      <SalesList entries={entries} />
    </>
  );
}

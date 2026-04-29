import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/require-session";
import { getServerClient } from "@/lib/supabase/server";
import { PageHeader } from "../../_components";
import { updateOrderStatus } from "../actions";
import type { Order, OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new:       "New",
  seen:      "Seen",
  preparing: "Preparing",
  served:    "Served",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<OrderStatus, string> = {
  new:       "bg-orange text-white",
  seen:      "bg-bg-deep text-green",
  preparing: "bg-green text-bg",
  served:    "bg-green-dark text-bg",
  cancelled: "bg-green/20 text-green/40",
};

const ACTION_BUTTONS: { status: OrderStatus; label: string }[] = [
  { status: "seen",      label: "Seen"      },
  { status: "preparing", label: "Preparing" },
  { status: "served",    label: "Served"    },
  { status: "cancelled", label: "Cancel"    },
];

type TimelineEntry = { label: string; value: string | null; reached: boolean };

function buildTimeline(order: Order): TimelineEntry[] {
  return [
    { label: "Placed",    value: order.created_at, reached: true },
    { label: "Seen",      value: order.seen_at,    reached: order.seen_at    !== null },
    { label: "Served",    value: order.served_at,  reached: order.served_at  !== null },
  ];
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["admin", "owner"]);
  const { id } = await params;
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) notFound();
  const order = data as Order;
  const timeline = buildTimeline(order);

  return (
    <>
      <PageHeader
        title={`Table ${order.table_number}`}
        subtitle={`Order #${order.id.slice(0, 8)}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 max-w-5xl">

        {/* ── left column ── */}
        <div className="flex flex-col gap-6">

          {/* items table */}
          <section>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
              Items
            </div>
            <div className="border-2 border-green bg-white overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-b-2 border-green bg-bg-deep text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
                    <th className="px-4 py-3 text-left">Item</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3 text-right">Unit</th>
                    <th className="px-4 py-3 text-right">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={i} className="border-b border-green/20 last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="font-ui font-semibold text-[13px] text-green">
                          {item.name_en}
                        </div>
                        <div className="font-ui text-[11px] text-green/50">
                          {item.name_tr}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bowlby text-[16px] text-green">
                        {item.qty}
                      </td>
                      <td className="px-4 py-3 text-right font-ui text-[13px] text-green/70">
                        {item.price.toLocaleString()} ₺
                      </td>
                      <td className="px-4 py-3 text-right font-bowlby text-[16px] text-orange">
                        {(item.price * item.qty).toLocaleString()} ₺
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-green bg-bg-deep">
                    <td colSpan={3} className="px-4 py-3 font-extrabold text-[10px] uppercase tracking-[0.22em] text-green/70">
                      Total
                    </td>
                    <td className="px-4 py-3 text-right font-bowlby text-[24px] text-orange">
                      {order.total.toLocaleString()} ₺
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* note */}
          {order.note?.trim() && (
            <section>
              <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
                Note
              </div>
              <div className="border-2 border-green bg-white px-4 py-3 font-ui text-[13px] text-green italic">
                {order.note}
              </div>
            </section>
          )}

        </div>

        {/* ── right column ── */}
        <div className="flex flex-col gap-6">

          {/* status + actions */}
          <section>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
              Status
            </div>
            <div className="border-2 border-green bg-white p-4 flex flex-col gap-4">
              <span
                className={`self-start font-ui text-[11px] font-extrabold tracking-[0.18em] uppercase px-2.5 py-1 ${STATUS_PILL[order.status]}`}
              >
                {STATUS_LABELS[order.status]}
              </span>
              <div className="flex flex-wrap gap-2">
                {ACTION_BUTTONS.map(({ status, label }) => (
                  <form key={status} action={updateOrderStatus}>
                    <input type="hidden" name="id"     value={order.id} />
                    <input type="hidden" name="status" value={status}   />
                    <button
                      type="submit"
                      disabled={order.status === status}
                      className="border-2 border-green text-green font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green hover:text-bg transition-colors"
                    >
                      {label}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          </section>

          {/* timeline */}
          <section>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
              Timeline
            </div>
            <div className="border-2 border-green bg-white">
              {timeline.map((entry, i) => (
                <div
                  key={entry.label}
                  className={[
                    "flex items-start gap-3 px-4 py-3",
                    i < timeline.length - 1 ? "border-b border-green/20" : "",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "mt-0.5 w-2 h-2 rounded-full shrink-0",
                      entry.reached ? "bg-green" : "bg-green/20",
                    ].join(" ")}
                  />
                  <div>
                    <div className="font-extrabold text-[10px] tracking-[0.18em] uppercase text-green">
                      {entry.label}
                    </div>
                    <div className="font-ui text-[12px] text-green/60 mt-0.5">
                      {fmt(entry.value)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </>
  );
}

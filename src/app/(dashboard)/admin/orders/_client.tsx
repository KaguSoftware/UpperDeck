"use client";

import type { Order, OrderStatus } from "@/types/database";
import { updateOrderStatus } from "./actions";

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  seen: "Seen",
  preparing: "Preparing",
  served: "Served",
  cancelled: "Cancelled",
};

const STATUS_PILL: Record<OrderStatus, string> = {
  new: "bg-orange text-white",
  seen: "bg-bg-deep text-green",
  preparing: "bg-green text-bg",
  served: "bg-green-dark text-bg",
  cancelled: "bg-green/20 text-green/40",
};

const ACTION_BUTTONS: { status: OrderStatus; label: string }[] = [
  { status: "seen",      label: "Seen"      },
  { status: "preparing", label: "Preparing" },
  { status: "served",    label: "Served"    },
  { status: "cancelled", label: "Cancel"    },
];

function elapsedLabel(createdAt: string): string {
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs < 30) return "just now";
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

function OrderCard({ order }: { order: Order }) {
  const urgent = order.status === "new" &&
    (Date.now() - new Date(order.created_at).getTime()) / 1000 > 90;

  return (
    <div
      className={[
        "border-2 bg-white p-5 flex flex-col gap-3",
        urgent ? "border-orange animate-[pulse-border_1.4s_ease-in-out_infinite]" : "border-green",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-bowlby text-[42px] leading-none text-orange">
          {order.table_number}
        </span>
        <div className="flex flex-col items-end gap-1 pt-1">
          <span className={`font-ui text-[10px] font-extrabold tracking-[0.18em] uppercase px-2 py-0.5 ${STATUS_PILL[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <span className={`font-ui text-[11px] font-extrabold tracking-[0.15em] uppercase px-2 py-0.5 ${urgent ? "text-orange" : "text-green/50"}`}>
            {elapsedLabel(order.created_at)}
          </span>
        </div>
      </div>

      <ul className="flex flex-col gap-1">
        {order.items.map((item, i) => (
          <li key={i} className="font-ui text-[13px] text-green">
            <span className="font-extrabold">{item.qty}×</span>{" "}
            {item.name_en} / {item.name_tr}{" "}
            <span className="text-orange font-bowlby text-[12px]">
              {(item.price * item.qty).toLocaleString()} ₺
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-green/20 pt-2">
        <span className="font-extrabold text-[9px] tracking-[0.28em] text-green/60 uppercase">Total</span>
        <span className="font-bowlby text-[24px] text-green">{order.total.toLocaleString()} ₺</span>
      </div>

      {order.note?.trim() && (
        <p className="font-ui text-[12px] text-green/70 italic border-t border-green/20 pt-2">
          {order.note}
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-green/20 pt-3">
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
  );
}

export function OrdersClient({ initialOrders }: { initialOrders: Order[] }) {
  return (
    <div>
      {initialOrders.length === 0 ? (
        <p className="font-ui text-[13px] text-green/50">No orders yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {initialOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

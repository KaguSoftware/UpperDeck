"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/realtime-js";
import type { Order, OrderStatus } from "@/types/database";
import { Loader } from "@/components/Loader/components";

type ConnectionState = "connecting" | "connected" | "disconnected";

const STALE_SECS = 90;
const STALE_REPEAT_MS = 30_000;
const RECONNECT_MIN_MS = 4_000;
const RECONNECT_MAX_MS = 7_000;

function elapsedSecs(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
}

function elapsedLabel(secs: number): string {
  if (secs < 30) return "şimdi";
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}d`;
  return `${Math.floor(mins / 60)}s`;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Yeni",
  seen: "Görüldü",
  preparing: "Hazırlanıyor",
  served: "Teslim Edildi",
  cancelled: "İptal",
};

const STATUS_PILL: Record<OrderStatus, string> = {
  new: "bg-orange text-white",
  seen: "bg-bg-deep text-green",
  preparing: "bg-green text-bg",
  served: "bg-green-dark text-bg",
  cancelled: "bg-green/20 text-green/40",
};

const ACTION_BUTTONS: { status: OrderStatus; label: string }[] = [
  { status: "seen",      label: "Görüldü"      },
  { status: "preparing", label: "Hazırlanıyor" },
  { status: "served",    label: "Teslim Edildi" },
  { status: "cancelled", label: "İptal"        },
];


function isStale(order: Order): boolean {
  return order.status === "new" && elapsedSecs(order.created_at) > STALE_SECS;
}

// ─── ElapsedBadge ────────────────────────────────────────────────────────────

function ElapsedBadge({ createdAt, status }: { createdAt: string; status: OrderStatus }) {
  const [secs, setSecs] = useState(() => elapsedSecs(createdAt));
  const urgent = status === "new" && secs > STALE_SECS;

  useEffect(() => {
    const id = setInterval(() => setSecs(elapsedSecs(createdAt)), 10_000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span
      className={[
        "font-ui text-[11px] font-extrabold tracking-[0.15em] uppercase px-2 py-0.5",
        urgent ? "text-orange animate-[pulse-border_1.4s_ease-in-out_infinite]" : "text-green/50",
      ].join(" ")}
    >
      {elapsedLabel(secs)}
    </span>
  );
}

// ─── OrderCard ───────────────────────────────────────────────────────────────

function OrderCard({ order, onStatusChange }: { order: Order; onStatusChange: (id: string, status: OrderStatus) => void }) {
  const urgent = isStale(order);

  function handleStatus(status: OrderStatus) {
    onStatusChange(order.id, status);
  }

  return (
    <div
      className={[
        "border-2 bg-white p-5 flex flex-col gap-3",
        urgent
          ? "border-orange animate-[pulse-border_1.4s_ease-in-out_infinite]"
          : "border-green",
      ].join(" ")}
    >
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <span className="font-bowlby text-[42px] leading-none text-orange">
          {order.table_number}
        </span>
        <div className="flex flex-col items-end gap-1 pt-1">
          <span
            className={`font-ui text-[10px] font-extrabold tracking-[0.18em] uppercase px-2 py-0.5 ${STATUS_PILL[order.status]}`}
          >
            {STATUS_LABELS[order.status]}
          </span>
          <ElapsedBadge createdAt={order.created_at} status={order.status} />
        </div>
      </div>

      {/* items */}
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

      {/* total */}
      <div className="flex items-center justify-between border-t border-green/20 pt-2">
        <span className="font-extrabold text-[9px] tracking-[0.28em] text-green/60 uppercase">
          Toplam
        </span>
        <span className="font-bowlby text-[24px] text-green">
          {order.total.toLocaleString()} ₺
        </span>
      </div>

      {/* note */}
      {order.note?.trim() && (
        <p className="font-ui text-[12px] text-green/70 italic border-t border-green/20 pt-2">
          {order.note}
        </p>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2 border-t border-green/20 pt-3">
        {ACTION_BUTTONS.map(({ status, label }) => (
          <button
            key={status}
            type="button"
            disabled={order.status === status}
            onClick={() => handleStatus(status)}
            className="border-2 border-green text-green font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 bg-transparent cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-green hover:text-bg transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── OrdersClient ─────────────────────────────────────────────────────────────

export function OrdersClient({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders]           = useState<Order[]>(initialOrders);
  const [audioArmed, setAudioArmed]   = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const audioRef        = useRef<HTMLAudioElement | null>(null);
  const audioArmedRef   = useRef(false);
  // staleTimers: orderId → interval id for the repeating alarm
  const staleTimers     = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const reconnectTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const connStateRef    = useRef<ConnectionState>("connecting");

  // Keep refs in sync
  useEffect(() => { audioArmedRef.current = audioArmed; }, [audioArmed]);
  useEffect(() => { connStateRef.current = connectionState; }, [connectionState]);

  // ── document title ──────────────────────────────────────────────────────
  const unseenCount = orders.filter((o) => o.status === "new").length;
  useEffect(() => {
    document.title = unseenCount > 0
      ? `(${unseenCount}) Orders · Upperdeck`
      : "Orders · Upperdeck";
  }, [unseenCount]);

  // ── audio helper ────────────────────────────────────────────────────────
  const playNotification = useCallback(() => {
    if (!audioRef.current || !audioArmedRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
    audioRef.current.play().catch(() => {/* silent */});
  }, []);

  // ── stale-alarm manager ─────────────────────────────────────────────────
  // Called whenever orders change; reconciles the staleTimers map.
  const syncStaleTimers = useCallback((currentOrders: Order[]) => {
    const staleIds = new Set(currentOrders.filter(isStale).map((o) => o.id));

    // Start timers for newly-stale orders
    for (const id of staleIds) {
      if (!staleTimers.current.has(id)) {
        playNotification(); // immediate first alarm
        const intervalId = setInterval(playNotification, STALE_REPEAT_MS);
        staleTimers.current.set(id, intervalId);
      }
    }

    // Clear timers for orders that are no longer stale
    for (const [id, intervalId] of staleTimers.current) {
      if (!staleIds.has(id)) {
        clearInterval(intervalId);
        staleTimers.current.delete(id);
      }
    }
  }, [playNotification]);

  // Re-run stale check every 10s (in case an order crosses the 90s threshold
  // while no realtime event fires — e.g. the page was open before the order arrived).
  useEffect(() => {
    const id = setInterval(() => syncStaleTimers(orders), 10_000);
    return () => clearInterval(id);
  }, [orders, syncStaleTimers]);

  // Also sync immediately whenever orders array changes
  useEffect(() => {
    syncStaleTimers(orders);
  }, [orders, syncStaleTimers]);

  // Clean up all stale timers on unmount
  useEffect(() => {
    return () => {
      for (const id of staleTimers.current.values()) clearInterval(id);
      staleTimers.current.clear();
    };
  }, []);

  // ── reconnect + poll helpers ─────────────────────────────────────────────
  const stopReconnectAndPoll = useCallback(() => {
    if (reconnectTimer.current) { clearInterval(reconnectTimer.current); reconnectTimer.current = null; }
  }, []);

  // ── realtime subscription ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getBrowserClient();
    let channel = supabase.channel("orders-stream");

    function subscribe() {
      channel = supabase
        .channel("orders-stream")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "orders" },
          (payload) => {
            const newOrder = payload.new as Order;
            setOrders((prev) => [newOrder, ...prev]);
            if (audioArmedRef.current) playNotification();
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders" },
          (payload) => {
            const updated = payload.new as Order;
            setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
          }
        )
        .subscribe((status) => {
          if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            setConnectionState("connected");
            stopReconnectAndPoll();
          } else if (
            status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
            status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
            status === REALTIME_SUBSCRIBE_STATES.CLOSED
          ) {
            setConnectionState("disconnected");

            // Reconnect with jitter (4–7s) to avoid thundering herd
            if (!reconnectTimer.current) {
              const delay = RECONNECT_MIN_MS + Math.random() * (RECONNECT_MAX_MS - RECONNECT_MIN_MS);
              reconnectTimer.current = setInterval(() => {
                if (connStateRef.current === "disconnected") {
                  supabase.removeChannel(channel);
                  subscribe();
                }
              }, delay);
            }

          } else {
            setConnectionState("connecting");
          }
        });
    }

    subscribe();

    return () => {
      stopReconnectAndPoll();
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── start shift ──────────────────────────────────────────────────────────
  const handleStartShift = useCallback(() => {
    const audio = new Audio("/notification.mp3");
    audio.volume = 0.01;
    audio.play().catch(() => {
      console.info("[orders] notification.mp3 missing or autoplay blocked — audio disabled");
    });
    audioRef.current = audio;
    setAudioArmed(true);
  }, []);

  // ── optimistic status update ─────────────────────────────────────────────
  const handleStatusChange = useCallback((id: string, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
  }, []);

  // ── derived ──────────────────────────────────────────────────────────────
  const staleCount = orders.filter(isStale).length;

  const connDot = {
    connecting:   "bg-orange/70",
    connected:    "bg-green",
    disconnected: "bg-orange",
  }[connectionState];

  const connLabel = {
    connecting:   "Bağlanıyor…",
    connected:    "Canlı",
    disconnected: "Bağlantı Kesildi",
  }[connectionState];

  return (
    <div>
      {/* stale-order banner */}
      {staleCount > 0 && (
        <div className="mb-4 bg-orange text-white font-ui font-extrabold text-[11px] tracking-[0.18em] uppercase px-4 py-3">
          ⚠ {staleCount} siparişe bakılması gerekiyor
        </div>
      )}

      {/* disconnected banner */}
      {connectionState === "disconnected" && (
        <div className="mb-4 bg-[#fff3cd] border-2 border-[#e0a800] text-[#7a5100] font-ui font-extrabold text-[11px] tracking-[0.15em] uppercase px-4 py-3">
          ⚠ Canlı güncellemeler bağlantısı kesildi — her 5 saniyede tekrar deneniyor
        </div>
      )}

      {/* toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-1.5">
          {connectionState === "connecting" ? (
            <Loader size="xs" />
          ) : (
            <span className={`w-2 h-2 rounded-full inline-block ${connDot}`} />
          )}
          <span className="font-ui text-[11px] font-extrabold tracking-[0.15em] uppercase text-green/70">
            {connLabel}
          </span>
        </div>

        {!audioArmed ? (
          <button
            type="button"
            onClick={handleStartShift}
            className="bg-orange text-white border-0 px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.18em] uppercase cursor-pointer"
          >
            Vardiyayı Başlat
          </button>
        ) : (
          <span className="bg-green text-bg font-ui font-extrabold text-[11px] tracking-[0.18em] uppercase px-3 py-1.5">
            ● Ses Etkin
          </span>
        )}
      </div>

      {/* order list */}
      {orders.length === 0 ? (
        <p className="font-ui text-[13px] text-green/50">Henüz sipariş yok.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}

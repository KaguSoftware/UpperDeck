"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";
import { TopBar } from "@/components/TopBar/components";
import { Hero } from "@/components/Hero/components";
import { FilterPills } from "@/components/FilterPills/components";
import { MenuStage } from "@/components/MenuStage/components";
import { ItemModal } from "@/components/ItemModal/components";
import { CartDrawer } from "@/components/CartDrawer/components";
import { WaiterButton } from "@/components/WaiterButton/components";
import { QrRequiredModal } from "@/components/QrRequiredModal/components";
import { BellTutorial } from "@/components/BellTutorial/components";
import { Toast } from "@/components/Toast/components";
import { Ticker } from "@/components/Ticker/components";
import { Footer } from "@/components/Footer/components";
import type { PlacedCard } from "@/components/MenuCard/types";
import type { CartItem } from "@/components/CartDrawer/types";
import type { AddonOptionPublic, SuggestedItemPublic } from "@/lib/menu/queries";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";
import type { Messages } from "@/i18n";
import type { PublicCategory, PublicMenuItem } from "@/lib/menu/queries";
const CART_STORAGE_KEY = "upperdeck-cart";

type PersistedCart = {
  cartItems: CartItem[];
  tableNumber: number | null;
  note: string;
};

type PhoneMenuProps = {
  messages: Messages;
  locale: import("@/i18n/config").Locale;
  categories: PublicCategory[];
  items: PublicMenuItem[];
  initialTableNumber?: number;
  disabledTables?: number[];
  heroMode?: "none" | "media" | "featured";
  heroMediaUrl?: string | null;
  featuredItem?: { id: string; name: string; image_url: string | null; emoji: string } | null;
  featuredItemId?: string | null;
  featuredLabel?: string | null;
  featuredBadge?: string | null;
  featuredDiscount?: number | null;
};

export function PhoneMenu({ messages: t, locale, categories, items, initialTableNumber, disabledTables = [], heroMode, heroMediaUrl, featuredItem, featuredItemId, featuredLabel, featuredBadge, featuredDiscount }: PhoneMenuProps) {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(initialTableNumber ?? null);
  const [tableLocked] = useState(initialTableNumber !== undefined);
  const [note, setNote] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeSlug, setActiveSlug] = useState("");
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [showBellTutorial, setShowBellTutorial] = useState(false);
  const [waiterSecondsLeft, setWaiterSecondsLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const waiterCooldownUntil = useRef(0);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pillsNavRef = useRef<HTMLElement>(null);
  const pillsWrapRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const heroSentinelRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen for menu updates broadcast from admin and refresh server data
  useEffect(() => {
    const supabase = getBrowserClient();
    const channel = supabase.channel("menu-updates")
      .on("broadcast", { event: "refresh" }, () => { router.refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router]);

  // Hydrate from sessionStorage on mount (client-only). URL table number wins over session.
  useEffect(() => {
    let resolvedTable: number | null = initialTableNumber ?? null;
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed: PersistedCart = JSON.parse(raw);
        if (parsed.cartItems) setCartItems(parsed.cartItems);
        // URL-provided table number always wins
        if (initialTableNumber === undefined && parsed.tableNumber != null) {
          setTableNumber(parsed.tableNumber);
          resolvedTable = parsed.tableNumber;
        }
        if (parsed.note != null) setNote(parsed.note);
      }
    } catch {
      // ignore malformed storage
    }
    // First-scan bell tutorial: show once per session when a valid, enabled table is present.
    try {
      const seen = sessionStorage.getItem("bellTutorial_seen") === "true";
      const hasTable = resolvedTable != null && resolvedTable > 0;
      const tableEnabled = hasTable && !disabledTables.includes(resolvedTable!);
      if (!seen && tableEnabled) setShowBellTutorial(true);
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced save on every change
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ cartItems, tableNumber, note }));
      } catch {
        // ignore quota errors
      }
    }, 200);
  }, [cartItems, tableNumber, note]);

  // Restore persisted waiter cooldown on mount
  useEffect(() => {
    if (!tableNumber) return;
    try {
      const raw = localStorage.getItem(`waiter_t${tableNumber}`);
      if (!raw) return;
      const { until } = JSON.parse(raw) as { until: number; count: number };
      const remaining = Math.ceil((until - Date.now()) / 1000);
      if (remaining > 0) {
        waiterCooldownUntil.current = until;
        setWaiterSecondsLeft(remaining);
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableNumber]);

  // Waiter cooldown ticker
  useEffect(() => {
    if (waiterSecondsLeft <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.ceil((waiterCooldownUntil.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setWaiterSecondsLeft(0);
        clearInterval(id);
      } else {
        setWaiterSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [waiterSecondsLeft]);

  const handleWaiterCalled = useCallback((cooldownMs: number) => {
    waiterCooldownUntil.current = Date.now() + cooldownMs;
    setWaiterSecondsLeft(Math.ceil(cooldownMs / 1000));
    if (tableNumber) {
      try {
        const raw = localStorage.getItem(`waiter_t${tableNumber}`);
        const prev = raw ? JSON.parse(raw) as { until: number; count: number } : { count: 0 };
        localStorage.setItem(`waiter_t${tableNumber}`, JSON.stringify({ until: waiterCooldownUntil.current, count: prev.count }));
      } catch { /* ignore */ }
    }
  }, [tableNumber]);

  const flashToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShow(false), TOAST_DURATION_MS);
  }, []);

  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const handleCartClick = useCallback(() => {
    if (!tableNumber || tableNumber <= 0) {
      setQrModalOpen(true);
      return;
    }
    setCartOpen(true);
  }, [tableNumber]);

  const handleCartCallWaiter = useCallback(async () => {
    if (submitting || waiterSecondsLeft > 0 || !tableNumber || tableNumber <= 0) return;
    setSubmitting(true);
    try {
      const { callWaiter } = await import("@/lib/waiter/call");
      await callWaiter(tableNumber, "order");
      handleWaiterCalled(10_000);
      flashToast(t.cart.waiterCalled);
    } catch (err) {
      console.error("[handleCartCallWaiter] failed", err);
      flashToast(t.cart.error_send);
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, waiterSecondsLeft, tableNumber, handleWaiterCalled, flashToast, t.cart.waiterCalled, t.cart.error_send]);

  const handleRemove = useCallback((id: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleIncrement = useCallback((id: string) => {
    setCartItems((prev) => prev.map((i) => i.id === id ? { ...i, qty: i.qty + 1 } : i));
  }, []);

  const handleDecrement = useCallback((id: string) => {
    setCartItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (!item) return prev;
      if (item.qty <= 1) return prev.filter((i) => i.id !== id);
      return prev.map((i) => i.id === id ? { ...i, qty: i.qty - 1 } : i);
    });
  }, []);

  const handleAdd = useCallback((extras: (AddonOptionPublic & { required?: boolean; groupLabel?: string })[], itemNote: string) => {
    if (!activeItem) return;
    const { id: menu_item_id, name, price, discountPct } = activeItem;
    const basePrice = discountPct ? Math.round(price * (1 - discountPct / 100)) : price;
    const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
    const effectivePrice = basePrice + extrasTotal;
    // Items with extras or a note get a unique cart id so they don't merge with the plain version
    const noteKey = itemNote ? `__note${itemNote.slice(0, 8)}` : "";
    const cartId = extras.length > 0 || itemNote
      ? `${menu_item_id}__${extras.map((e) => e.id).join("_")}${noteKey}`
      : menu_item_id;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === cartId);
      if (existing) return prev.map((i) => i.id === cartId ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: cartId, menu_item_id, name, price: effectivePrice, qty: 1, extras: extras.length > 0 ? extras : undefined, itemNote: itemNote || undefined }];
    });
    setActiveItem(null);
    flashToast(`${t.toast.addedPrefix}${name}`);
  }, [activeItem, flashToast, t.toast]);

  const handleSuggestedClick = useCallback((sug: SuggestedItemPublic) => {
    const fullItem = items.find((i) => i.id === sug.id);
    if (!fullItem) return;
    setActiveItem({
      ...fullItem,
      sz: "size-m",
      fill: fullItem.highlight === "orange-fill" ? "orange-fill" : fullItem.highlight === "green-fill" ? "green-fill" : "",
      rot: 0,
      w: 0,
      h: 0,
      x: 0,
      y: 0,
    });
  }, [items]);

  const scrollPillIntoView = useCallback((slug: string) => {
    const nav = pillsNavRef.current;
    if (!nav) return;
    const btn = nav.querySelector<HTMLButtonElement>(`[data-cat="${CSS.escape(slug)}"]`);
    if (!btn) return;
    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const offset = btnRect.left - navRect.left - (navRect.width / 2) + (btnRect.width / 2);
    nav.scrollBy({ left: offset, behavior: "smooth" });
  }, []);

  const handlePillSelect = useCallback(
    (slug: string, btn: HTMLButtonElement) => {
      setActiveSlug(slug);
      isAutoScrollingRef.current = true;

      const target = stageRef.current?.querySelector<HTMLElement>(
        `[data-cat="${CSS.escape(slug)}"]`
      );
      if (target && stageWrapRef.current) {
        const wrap = stageWrapRef.current;
        const targetTop = target.getBoundingClientRect().top;
        const wrapTop = wrap.getBoundingClientRect().top;
        const pillsHeight = pillsWrapRef.current?.offsetHeight ?? 0;
        wrap.scrollTo({ top: wrap.scrollTop + (targetTop - wrapTop) - pillsHeight, behavior: "smooth" });
      }
      scrollPillIntoView(slug);
      setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    },
    []
  );

  useEffect(() => {
    scrollPillIntoView(activeSlug);
  }, [activeSlug]);

  const handleTopClick = useCallback(() => {
    stageWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleFeaturedClick = useCallback(() => {
    if (!featuredItem) return;
    const target = stageRef.current?.querySelector<HTMLButtonElement>(
      `[data-item="${CSS.escape(featuredItem.id)}"]`
    );
    if (!target || !stageWrapRef.current) return;
    isAutoScrollingRef.current = true;
    const wrap = stageWrapRef.current;
    const targetTop = target.getBoundingClientRect().top;
    const wrapTop = wrap.getBoundingClientRect().top;
    wrap.scrollTo({ top: wrap.scrollTop + (targetTop - wrapTop) - 8, behavior: "smooth" });
    setTimeout(() => {
      isAutoScrollingRef.current = false;
      target.click();
    }, 800);
  }, [featuredItem]);

  // IntersectionObserver: collapse pills when hero scrolls out of view
  useEffect(() => {
    const sentinel = heroSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { setHeroCollapsed(!entry.isIntersecting); },
      { root: stageWrapRef.current, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const wrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;

    const scrollTop = wrap.scrollTop;
    const wrapHeight = wrap.clientHeight;

    setScrolledDown(scrollTop > 80);

    if (footerRef.current) {
      setFooterVisible(footerRef.current.offsetTop < scrollTop + wrapHeight - 64);
    }

    if (isAutoScrollingRef.current) return;

    const headers = stage.querySelectorAll<HTMLElement>("[data-cat]");
    let current = "";
    headers.forEach((h) => {
      if (h.offsetTop - 20 <= scrollTop) {
        current = h.dataset.cat ?? "";
      }
    });
    setActiveSlug(current);
  }, []);

  const pillItems = categories.map((c) => ({ id: c.slug, label: c.name, image_url: c.image_url, emoji: c.emoji }));

  return (
    <div className="fixed inset-0 flex flex-col">
      <div ref={topbarRef}>
        <TopBar
          cartCount={cartCount}
          onCartClick={handleCartClick}
          onTopClick={handleTopClick}
          brandMain={t.brand.name.main}
          brandAccent={t.brand.name.accent}
          brandSub={t.brand.sub}
          orderLabel={t.topbar.order}
          locale={locale}
        />
      </div>
      <div className="relative flex-1 min-h-0">
        <div
          ref={stageWrapRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ overflowAnchor: "none" }}
        >
          <Hero
            collapsed={false}
            itemCount={items.length}
            headline1={t.hero.headline1}
            headline2={t.hero.headline2}
            headline3={t.hero.headline3}
            headline4={t.hero.headline4}
            openHours={t.hero.openHours}
            itemsLabel={t.hero.items}
            heroMode={heroMode}
            heroMediaUrl={heroMediaUrl}
            featuredItem={featuredItem}
            featuredLabel={featuredLabel}
            featuredBadge={featuredBadge}
            featuredDiscount={featuredDiscount}
            onFeaturedClick={handleFeaturedClick}
          />
          <div ref={heroSentinelRef} className="h-0" style={{ overflowAnchor: "none" }} />
          <div ref={pillsWrapRef} className="sticky top-0 z-10" style={{ overflowAnchor: "none" }}>
            <FilterPills
              items={pillItems}
              activeId={activeSlug}
              onSelect={handlePillSelect}
              navRef={pillsNavRef}
              compact={heroCollapsed}
            />
          </div>
          <MenuStage
            onOpen={setActiveItem}
            stageRef={stageRef}
            categories={categories}
            items={items}
            itemLabel={(count) => `${count} ${count > 1 ? t.stage.items : t.stage.item}`}
            featuredItemId={heroMode === "featured" ? featuredItemId : null}
            featuredDiscount={featuredDiscount}
          />
          <div ref={footerRef}><Footer /></div>
        </div>
        <button
          type="button"
          onClick={handleTopClick}
          aria-label="Scroll to top"
          className={[
            "absolute bottom-4 right-4 w-10 h-10 bg-green text-bg border-0 grid place-items-center cursor-pointer shadow-lg transition-all duration-300 z-9999",
            scrolledDown && !footerVisible && !activeItem ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none",
          ].join(" ")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 12V2M7 2L2 7M7 2L12 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
          </svg>
        </button>
        <WaiterButton
          tableNumber={tableNumber ?? 0}
          labelTitle={t.waiter.title}
          labelBill={t.waiter.bill}
          labelWaiter={t.waiter.call}
          labelCancel={t.waiter.cancel}
          labelNotified={t.waiter.notified}
          hidden={footerVisible || !!activeItem || (tableNumber != null && tableNumber > 0 && disabledTables.includes(tableNumber))}
          scrollRef={stageWrapRef}
          heroCollapsed={heroCollapsed}
          onBeforeOpen={() => {
            if (!tableNumber || tableNumber <= 0) {
              setQrModalOpen(true);
              return false;
            }
            return true;
          }}
          secondsLeft={waiterSecondsLeft}
          onWaiterCalled={handleWaiterCalled}
        />
      </div>
      <CartDrawer
        items={cartItems}
        isOpen={cartOpen}
        onClose={() => { setCartOpen(false); setNote(""); }}
        onRemove={handleRemove}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onTableChange={setTableNumber}
        onNoteChange={setNote}
        tableNumber={tableNumber}
        note={note}
        totalLabel={t.cart.title}
        subtotalLabel={t.cart.subtotal}
        emptyLabel={t.toast.empty}
        tableLabel={t.cart.table_number}
        tableFromQrLabel={t.cart.table_from_qr}
        notePlaceholder={t.cart.note_placeholder}
        callWaiterLabel={t.cart.callWaiter}
        callWaiterSendingLabel={t.cart.sending}
        callWaiterHeadedLabel={t.cart.headed}
        submitting={submitting}
        onCallWaiter={() => { void handleCartCallWaiter(); }}
        waiterCooldownSeconds={waiterSecondsLeft}
        waiterCooldownLabel={waiterSecondsLeft > 0 ? `You can send another request in ${Math.floor(waiterSecondsLeft / 60)}:${String(waiterSecondsLeft % 60).padStart(2, "0")}` : ""}
        tableFromQr={tableLocked}
        topOffset={topbarRef.current?.offsetHeight ?? 0}
        coupon={{
          couponLabel: t.coupon.label,
          couponPlaceholder: t.coupon.placeholder,
          couponApply: t.coupon.apply,
          noOfferTitle: t.coupon.noOfferTitle,
          noOfferBody: t.coupon.noOfferBody,
          emailPlaceholder: t.coupon.emailPlaceholder,
          subscribeLabel: t.coupon.subscribe,
          subscribedMessage: t.coupon.subscribed,
          noCouponPrefix: t.coupon.noCouponPrefix,
          noCouponLink: t.coupon.noCouponLink,
        }}
      />
      <ItemModal
        item={activeItem}
        onClose={() => setActiveItem(null)}
        onAdd={handleAdd}
        onSuggestedClick={handleSuggestedClick}
        spicyLabel={t.modal.spicy}
        priceLabel={t.modal.price}
        addToOrderLabel={t.modal.addToOrder}
        specialInstructionsLabel={t.modal.specialInstructions}
        specialInstructionsPlaceholder={t.modal.specialInstructionsPlaceholder}
        alsoTryLabel={t.modal.alsoTry}
        requiredLabel={t.modal.required}
        requiredMissingPrefix={t.modal.requiredMissing}
        addonGroups={activeItem?.addonGroups ?? []}
        suggestedItems={activeItem?.suggestedItems ?? []}
      />
      <QrRequiredModal
        show={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title={t.qrRequired.title}
        body={t.qrRequired.body}
      />
      <Toast message={toastMsg} show={toastShow} />
      <Ticker tags={t.ticker} />
      {showBellTutorial
        && tableNumber != null
        && tableNumber > 0
        && !disabledTables.includes(tableNumber)
        && !activeItem
        && !cartOpen
        && !qrModalOpen
        && (
        <BellTutorial
          eyebrow={t.bellTutorial.eyebrow}
          title={t.bellTutorial.title}
          dismissHint={t.bellTutorial.dismissHint}
          onDismiss={() => {
            setShowBellTutorial(false);
            try { sessionStorage.setItem("bellTutorial_seen", "true"); } catch { /* ignore */ }
          }}
        />
      )}
    </div>
  );
}

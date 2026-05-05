"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { TopBar } from "@/components/TopBar/components";
import { Hero } from "@/components/Hero/components";
import { FilterPills } from "@/components/FilterPills/components";
import { MenuStage } from "@/components/MenuStage/components";
import { ItemModal } from "@/components/ItemModal/components";
import { CartDrawer } from "@/components/CartDrawer/components";
import { WaiterButton } from "@/components/WaiterButton/components";
import { Toast } from "@/components/Toast/components";
import { Ticker } from "@/components/Ticker/components";
import { Footer } from "@/components/Footer/components";
import type { PlacedCard } from "@/components/MenuCard/types";
import type { CartItem, CheckoutState } from "@/components/CartDrawer/types";
import { ADDONS } from "@/components/ItemModal/addons";
import type { AddonOption } from "@/components/ItemModal/addons";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";
import type { Messages } from "@/i18n";
import type { PublicCategory, PublicMenuItem } from "@/lib/menu/queries";
import { submitOrder } from "@/lib/orders/submit";

const COLLAPSE_AT = 40;
const EXPAND_AT = 8;
const CART_STORAGE_KEY = "upperdeck-cart";

type PersistedCart = {
  cartItems: CartItem[];
  tableNumber: number | null;
  note: string;
};

type PhoneMenuProps = {
  messages: Messages;
  categories: PublicCategory[];
  items: PublicMenuItem[];
  initialTableNumber?: number;
  heroMode?: "none" | "media" | "featured";
  heroMediaUrl?: string | null;
  heroMediaType?: "image" | "video" | null;
  featuredItem?: { id: string; name: string; image_url: string | null; emoji: string } | null;
  featuredItemId?: string | null;
  featuredLabel?: string | null;
  featuredBadge?: string | null;
  featuredDiscount?: number | null;
};

export function PhoneMenu({ messages: t, categories, items, initialTableNumber, heroMode, heroMediaUrl, heroMediaType, featuredItem, featuredItemId, featuredLabel, featuredBadge, featuredDiscount }: PhoneMenuProps) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<number | null>(initialTableNumber ?? null);
  const [tableLocked] = useState(initialTableNumber !== undefined);
  const [note, setNote] = useState("");
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({ status: "idle" });
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeSlug, setActiveSlug] = useState("");
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [orderCooldownSeconds, setOrderCooldownSeconds] = useState(0);
  const orderCooldownUntil = useRef(0);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pillsNavRef = useRef<HTMLElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollingRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from sessionStorage on mount (client-only). URL table number wins over session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      if (raw) {
        const parsed: PersistedCart = JSON.parse(raw);
        if (parsed.cartItems) setCartItems(parsed.cartItems);
        // URL-provided table number always wins
        if (initialTableNumber === undefined && parsed.tableNumber != null) {
          setTableNumber(parsed.tableNumber);
        }
        if (parsed.note != null) setNote(parsed.note);
      }
    } catch {
      // ignore malformed storage
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Order submit cooldown ticker
  useEffect(() => {
    if (orderCooldownSeconds <= 0) return;
    const id = setInterval(() => {
      const remaining = Math.ceil((orderCooldownUntil.current - Date.now()) / 1000);
      if (remaining <= 0) {
        setOrderCooldownSeconds(0);
        clearInterval(id);
      } else {
        setOrderCooldownSeconds(remaining);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [orderCooldownSeconds]);

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


  const flashToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShow(false), TOAST_DURATION_MS);
  }, []);

  const cartCount = cartItems.reduce((sum, i) => sum + i.qty, 0);

  const handleCartClick = useCallback(() => {
    setHeroCollapsed(true);
    setCartOpen(true);
  }, []);

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

  const handleAdd = useCallback((extras: AddonOption[]) => {
    if (!activeItem) return;
    const { id: menu_item_id, name, price, discountPct } = activeItem;
    const basePrice = discountPct ? Math.round(price * (1 - discountPct / 100)) : price;
    const extrasTotal = extras.reduce((s, e) => s + e.price, 0);
    const effectivePrice = basePrice + extrasTotal;
    // Items with extras get a unique cart id so they don't merge with the plain version
    const cartId = extras.length > 0 ? `${menu_item_id}__${extras.map((e) => e.id).join("_")}` : menu_item_id;
    setCartItems((prev) => {
      const existing = prev.find((i) => i.id === cartId);
      if (existing) return prev.map((i) => i.id === cartId ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: cartId, menu_item_id, name, price: effectivePrice, qty: 1, extras: extras.length > 0 ? extras : undefined }];
    });
    setActiveItem(null);
    flashToast(`${t.toast.addedPrefix}${name}`);
  }, [activeItem, flashToast, t.toast]);

  const doSubmit = useCallback(async () => {
    if (cartItems.length === 0) return;
    setCheckoutState({ status: "pending" });

    const clientTotal = cartItems.reduce((sum, i) => sum + i.price * i.qty, 0);
    const result = await submitOrder({
      table_number: tableNumber ?? 0,
      _simulateFailure: simulateFailure,
      items: cartItems.map((i) => {
        const extrasLabel = i.extras && i.extras.length > 0
          ? ` + ${i.extras.map((e) => e.label).join(", ")}`
          : "";
        return {
          menu_item_id: i.menu_item_id,
          name_en: i.name + extrasLabel,
          name_tr: i.name + extrasLabel,
          price: i.price,
          qty: i.qty,
        };
      }),
      note,
      total: clientTotal,
    });

    if (result.ok) {
      setCartItems([]);
      setNote("");
      if (!tableLocked) setTableNumber(null);
      try { sessionStorage.removeItem(CART_STORAGE_KEY); } catch { /* ignore */ }
      setCheckoutState({ status: "idle" });
      setCartOpen(false);
      orderCooldownUntil.current = Date.now() + 60_000;
      setOrderCooldownSeconds(60);
      flashToast(`${t.toast.orderSentPrefix}${tableNumber && tableNumber > 0 ? tableNumber : "—"}`);
    } else if (result.error === "validation") {
      setCheckoutState({
        status: "validation",
        message: result.message ?? t.cart.error_validation,
      });
    } else {
      // network or server — keep cart, show offline fallback
      setCheckoutState({ status: "offline" });
    }
  }, [cartItems, tableNumber, note, tableLocked, flashToast, t]);

  const handleCheckout = useCallback(() => {
    void doSubmit();
  }, [doSubmit]);

  const handleRetry = useCallback(() => {
    setCheckoutState({ status: "idle" });
    void doSubmit();
  }, [doSubmit]);

  const handlePillSelect = useCallback(
    (slug: string, btn: HTMLButtonElement) => {
      setActiveSlug(slug);
      isAutoScrollingRef.current = true;

      const target = stageRef.current?.querySelector<HTMLElement>(
        `[data-cat="${CSS.escape(slug)}"]`
      );
      if (target) {
        stageWrapRef.current?.scrollTo({ top: target.offsetTop, behavior: "smooth" });
      }
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
    },
    []
  );

  useEffect(() => {
    const nav = pillsNavRef.current;
    if (!nav) return;
    const btn = nav.querySelector<HTMLButtonElement>(`[data-cat="${CSS.escape(activeSlug)}"]`);
    btn?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeSlug]);

  const handleTopClick = useCallback(() => {
    stageWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleFeaturedClick = useCallback(() => {
    if (!featuredItem) return;
    const target = stageRef.current?.querySelector<HTMLElement>(
      `[data-item="${CSS.escape(featuredItem.id)}"]`
    );
    if (!target) return;
    isAutoScrollingRef.current = true;
    stageWrapRef.current?.scrollTo({ top: target.offsetTop - 8, behavior: "smooth" });
    setTimeout(() => { isAutoScrollingRef.current = false; }, 800);
  }, [featuredItem]);

  const handleScroll = useCallback(() => {
    const wrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;

    const scrollTop = wrap.scrollTop;
    const wrapHeight = wrap.clientHeight;

    setHeroCollapsed((prev) => {
      if (!prev && scrollTop > COLLAPSE_AT) return true;
      if (prev && scrollTop < EXPAND_AT) return false;
      return prev;
    });

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
        />
      </div>
      <Hero
        collapsed={heroCollapsed}
        itemCount={items.length}
        headline1={t.hero.headline1}
        headline2={t.hero.headline2}
        headline3={t.hero.headline3}
        headline4={t.hero.headline4}
        openHours={t.hero.openHours}
        itemsLabel={t.hero.items}
        heroMode={heroMode}
        heroMediaUrl={heroMediaUrl}
        heroMediaType={heroMediaType}
        featuredItem={featuredItem}
        featuredLabel={featuredLabel}
        featuredBadge={featuredBadge}
        featuredDiscount={featuredDiscount}
        onFeaturedClick={handleFeaturedClick}
      />
      <FilterPills
        items={pillItems}
        activeId={activeSlug}
        onSelect={handlePillSelect}
        navRef={pillsNavRef}
        compact={heroCollapsed}
      />
      <div className="relative flex-1 min-h-0">
        <div
          ref={stageWrapRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
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
            heroCollapsed && !footerVisible && !activeItem ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none",
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
          hidden={footerVisible || !!activeItem}
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
        onCheckout={handleCheckout}
        onRetry={handleRetry}
        tableNumber={tableNumber}
        note={note}
        checkoutState={checkoutState}
        totalLabel={t.cart.title}
        subtotalLabel={t.cart.subtotal}
        emptyLabel={t.toast.empty}
        tableLabel={t.cart.table_number}
        tableFromQrLabel={t.cart.table_from_qr}
        notePlaceholder={t.cart.note_placeholder}
        sendLabel={t.cart.send}
        tryAgainLabel={t.cart.try_again}
        tableFromQr={tableLocked}
        simulateFailure={simulateFailure}
        onSimulateFailureChange={setSimulateFailure}
        topOffset={topbarRef.current?.offsetHeight ?? 0}
        orderCooldownSeconds={orderCooldownSeconds}
      />
      <ItemModal
        item={activeItem}
        onClose={() => setActiveItem(null)}
        onAdd={handleAdd}
        spicyLabel={t.modal.spicy}
        priceLabel={t.modal.price}
        addToOrderLabel={t.modal.addToOrder}
        addonGroups={activeItem ? (ADDONS[activeItem.id] ?? []) : []}
      />
      <Toast message={toastMsg} show={toastShow} />
      <Ticker tags={t.ticker} />
    </div>
  );
}

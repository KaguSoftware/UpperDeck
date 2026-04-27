"use client";

import { useState, useRef, useCallback, useLayoutEffect, useEffect } from "react";
import { TopBar } from "@/components/TopBar/components";
import { Hero } from "@/components/Hero/components";
import { FilterPills } from "@/components/FilterPills/components";
import { MenuStage } from "@/components/MenuStage/components";
import { ItemModal } from "@/components/ItemModal/components";
import { Toast } from "@/components/Toast/components";
import { Ticker } from "@/components/Ticker/components";
import type { PlacedCard } from "@/components/MenuCard/types";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";
import type { Messages } from "@/i18n";
import type { PublicCategory, PublicMenuItem } from "@/lib/menu/queries";

// Collapse when scrolled past this, only re-open when scrolled back below EXPAND_AT.
// The gap between the two prevents oscillation at the boundary.
const COLLAPSE_AT = 40;
const EXPAND_AT = 8;

type PhoneMenuProps = {
  messages: Messages;
  categories: PublicCategory[];
  items: PublicMenuItem[];
};

export function PhoneMenu({ messages: t, categories, items }: PhoneMenuProps) {
  const [cart, setCart] = useState(0);
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeSlug, setActiveSlug] = useState("");
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pillsNavRef = useRef<HTMLElement>(null);
  const isAutoScrollingRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    setStageWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setStageWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flashToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShow(false), TOAST_DURATION_MS);
  }, []);

  const handleCartClick = useCallback(() => {
    if (!cart) {
      flashToast(t.toast.empty);
    } else {
      const tmpl = cart > 1 ? t.toast.itemsOnDeckMany : t.toast.itemsOnDeckOne;
      flashToast(tmpl.replace("{count}", String(cart)));
    }
  }, [cart, flashToast, t.toast]);

  const handleAdd = useCallback(() => {
    if (!activeItem) return;
    setCart((c) => c + 1);
    const name = activeItem.name;
    setActiveItem(null);
    flashToast(`${t.toast.addedPrefix}${name}`);
  }, [activeItem, flashToast, t.toast]);

  const handlePillSelect = useCallback(
    (slug: string, btn: HTMLButtonElement) => {
      setActiveSlug(slug);
      isAutoScrollingRef.current = true;

      const target = stageRef.current?.querySelector<HTMLElement>(
        `[data-cat="${CSS.escape(slug)}"]`
      );
      if (target) {
        // offsetTop is relative to stageRef (the scroll container's only child),
        // so it equals the exact scrollTop needed.
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

  const handleScroll = useCallback(() => {
    const wrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;

    const scrollTop = wrap.scrollTop;

    // Hysteresis: collapse going down, but only re-open near the very top.
    // This prevents the hero from toggling when the user is near the threshold.
    setHeroCollapsed((prev) => {
      if (!prev && scrollTop > COLLAPSE_AT) return true;
      if (prev && scrollTop < EXPAND_AT) return false;
      return prev;
    });

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

  const pillItems = categories.map((c) => ({ id: c.slug, label: c.name }));

  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar
        cartCount={cart}
        onCartClick={handleCartClick}
        onTopClick={handleTopClick}
        brandMain={t.brand.name.main}
        brandAccent={t.brand.name.accent}
        brandSub={t.brand.sub}
        orderLabel={t.topbar.order}
      />
      <Hero
        collapsed={heroCollapsed}
        itemCount={items.length}
        headline1={t.hero.headline1}
        headline2={t.hero.headline2}
        headline3={t.hero.headline3}
        headline4={t.hero.headline4}
        openHours={t.hero.openHours}
        itemsLabel={t.hero.items}
      />
      <FilterPills
        items={pillItems}
        activeId={activeSlug}
        onSelect={handlePillSelect}
        navRef={pillsNavRef}
      />
      <div className="relative flex-1 min-h-0">
        <div
          ref={stageWrapRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-bg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <MenuStage
            stageWidth={stageWidth}
            onOpen={setActiveItem}
            stageRef={stageRef}
            categories={categories}
            items={items}
            itemLabel={(count) => `${count} ${count > 1 ? t.stage.items : t.stage.item}`}
          />
        </div>
        <button
          type="button"
          onClick={handleTopClick}
          aria-label="Scroll to top"
          className={[
            "absolute bottom-4 right-4 w-10 h-10 bg-green text-bg border-0 grid place-items-center cursor-pointer shadow-lg transition-all duration-300 z-9999",
            heroCollapsed ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none",
          ].join(" ")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 12V2M7 2L2 7M7 2L12 7" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
          </svg>
        </button>
      </div>
      <ItemModal
        item={activeItem}
        onClose={() => setActiveItem(null)}
        onAdd={handleAdd}
        spicyLabel={t.modal.spicy}
        priceLabel={t.modal.price}
        addToOrderLabel={t.modal.addToOrder}
      />
      <Toast message={toastMsg} show={toastShow} />
      <Ticker tags={t.ticker} />
    </div>
  );
}

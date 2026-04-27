"use client";

import { useState, useRef, useCallback, useLayoutEffect } from "react";
import { TopBar } from "@/components/TopBar/components";
import { Hero } from "@/components/Hero/components";
import { FilterPills } from "@/components/FilterPills/components";
import { MenuStage } from "@/components/MenuStage/components";
import { ItemModal } from "@/components/ItemModal/components";
import { Toast } from "@/components/Toast/components";
import { Ticker } from "@/components/Ticker/components";
import type { PlacedCard } from "@/components/MenuCard/types";
import { COLLAPSE_THRESHOLD } from "@/components/Hero/constants";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";
import type { Messages } from "@/i18n";
import type { PublicCategory, PublicMenuItem } from "@/lib/menu/queries";

const ALL_SLUG = "__all";

type PhoneMenuProps = {
  messages: Messages;
  categories: PublicCategory[];
  items: PublicMenuItem[];
};

export function PhoneMenu({ messages: t, categories, items }: PhoneMenuProps) {
  const [cart, setCart] = useState(0);
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeSlug, setActiveSlug] = useState(ALL_SLUG);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastShow, setToastShow] = useState(false);
  const [stageWidth, setStageWidth] = useState(0);

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
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

      if (slug === ALL_SLUG) {
        stageWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const target = stageRef.current?.querySelector<HTMLElement>(
          `[data-cat="${CSS.escape(slug)}"]`
        );
        if (target) {
          stageWrapRef.current?.scrollTo({ top: target.offsetTop, behavior: "smooth" });
        }
      }
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 600);
    },
    []
  );

  const handleScroll = useCallback(() => {
    const wrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const scrollTop = wrap.scrollTop;

    setHeroCollapsed(scrollTop > COLLAPSE_THRESHOLD);

    if (isAutoScrollingRef.current) return;
    const headers = stage.querySelectorAll<HTMLElement>("[data-cat]");
    let current = ALL_SLUG;
    if (scrollTop >= 20) {
      headers.forEach((h) => {
        if (h.offsetTop - 40 <= scrollTop) {
          current = h.dataset.cat ?? ALL_SLUG;
        }
      });
    }
    setActiveSlug(current);
  }, []);

  const pillItems = [
    { id: ALL_SLUG, label: t.filter.all },
    ...categories.map((c) => ({ id: c.slug, label: c.name })),
  ];

  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar
        cartCount={cart}
        onCartClick={handleCartClick}
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
      />
      <div
        ref={stageWrapRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-bg relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

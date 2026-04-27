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
import { CATEGORIES, ITEM_COUNT } from "@/data/menu";
import { COLLAPSE_THRESHOLD } from "@/components/Hero/constants";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";
import type { Messages } from "@/i18n";

type PhoneMenuProps = {
  messages: Messages;
};

export function PhoneMenu({ messages: t }: PhoneMenuProps) {
  const [cart, setCart] = useState(0);
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeCategory, setActiveCategory] = useState(t.filter.all);
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
    (cat: string, btn: HTMLButtonElement) => {
      setActiveCategory(cat);
      isAutoScrollingRef.current = true;

      if (cat === t.filter.all) {
        stageWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const rawCat = Object.entries(t.categories).find(([, v]) => v === cat)?.[0] ?? cat;
        const target = stageRef.current?.querySelector<HTMLElement>(
          `[data-cat="${CSS.escape(rawCat)}"]`
        );
        if (target) {
          stageWrapRef.current?.scrollTo({ top: target.offsetTop, behavior: "smooth" });
        }
      }
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setTimeout(() => { isAutoScrollingRef.current = false; }, 600);
    },
    [t.filter.all, t.categories]
  );

  const handleScroll = useCallback(() => {
    const wrap = stageWrapRef.current;
    const stage = stageRef.current;
    if (!wrap || !stage) return;
    const scrollTop = wrap.scrollTop;

    setHeroCollapsed(scrollTop > COLLAPSE_THRESHOLD);

    if (isAutoScrollingRef.current) return;
    const headers = stage.querySelectorAll<HTMLElement>("[data-cat]");
    let current = t.filter.all;
    if (scrollTop >= 20) {
      headers.forEach((h) => {
        if (h.offsetTop - 40 <= scrollTop) {
          const rawCat = h.dataset.cat ?? "";
          current = t.categories[rawCat as keyof typeof t.categories] ?? rawCat;
        }
      });
    }
    setActiveCategory(current);
  }, [t.filter.all, t.categories]);

  const allCategories = [t.filter.all, ...CATEGORIES.map((c) => t.categories[c as keyof typeof t.categories] ?? c)];

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
        itemCount={ITEM_COUNT}
        headline1={t.hero.headline1}
        headline2={t.hero.headline2}
        headline3={t.hero.headline3}
        headline4={t.hero.headline4}
        openHours={t.hero.openHours}
        itemsLabel={t.hero.items}
      />
      <FilterPills
        categories={allCategories}
        active={activeCategory}
        onSelect={handlePillSelect}
      />
      <div
        ref={stageWrapRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-[#fff1c2] relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <MenuStage
          stageWidth={stageWidth}
          onOpen={setActiveItem}
          stageRef={stageRef}
          catLabel={(cat) => t.categories[cat as keyof typeof t.categories] ?? cat}
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

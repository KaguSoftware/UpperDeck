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
import { ALL_CATEGORIES, ITEM_COUNT } from "@/data/menu";
import { TICKER_TAGS } from "@/components/Ticker/constants";
import { COLLAPSE_THRESHOLD } from "@/components/Hero/constants";
import { TOAST_DURATION_MS } from "@/components/Toast/constants";

export function PhoneMenu() {
  const [cart, setCart] = useState(0);
  const [activeItem, setActiveItem] = useState<PlacedCard | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
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
    flashToast(cart ? `${cart} item${cart > 1 ? "s" : ""} on the deck` : "Your order is empty");
  }, [cart, flashToast]);

  const handleAdd = useCallback(() => {
    if (!activeItem) return;
    setCart((c) => c + 1);
    const name = activeItem.name;
    setActiveItem(null);
    flashToast(`Added · ${name}`);
  }, [activeItem, flashToast]);

  const handlePillSelect = useCallback(
    (cat: string, btn: HTMLButtonElement) => {
      setActiveCategory(cat);
      isAutoScrollingRef.current = true;

      if (cat === "All") {
        stageWrapRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        const target = stageRef.current?.querySelector<HTMLElement>(
          `[data-cat="${CSS.escape(cat)}"]`
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
    let current = "All";
    if (scrollTop >= 20) {
      headers.forEach((h) => {
        if (h.offsetTop - 40 <= scrollTop) current = h.dataset.cat ?? current;
      });
    }
    setActiveCategory(current);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col">
      <TopBar cartCount={cart} onCartClick={handleCartClick} />
      <Hero collapsed={heroCollapsed} itemCount={ITEM_COUNT} />
      <FilterPills
        categories={ALL_CATEGORIES}
        active={activeCategory}
        onSelect={handlePillSelect}
      />
      <div
        ref={stageWrapRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-[#fff1c2] relative [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <MenuStage stageWidth={stageWidth} onOpen={setActiveItem} stageRef={stageRef} />
      </div>
      <ItemModal item={activeItem} onClose={() => setActiveItem(null)} onAdd={handleAdd} />
      <Toast message={toastMsg} show={toastShow} />
      <Ticker tags={TICKER_TAGS} />
    </div>
  );
}

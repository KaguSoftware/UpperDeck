"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { deleteItem, toggleAvailability, toggleSoldOut } from "./actions";
import { ConfirmDialog } from "@/components/ConfirmDialog/components";
import { clientToast } from "@/lib/admin/client-notify";

type Item = {
  id: string;
  name_en: string;
  price: number;
  image_url: string | null;
  spicy: boolean;
  is_available: boolean;
  sold_out: boolean;
  sort_order: number | null;
  category_name: string;
};

export function MenuList({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.name_en.toLowerCase().includes(q) ||
      i.category_name.toLowerCase().includes(q)
    );
  }, [items, query]);

  function handleToggle(id: string, current: boolean) {
    const next = !current;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_available: next } : i)));
    startTransition(async () => {
      try {
        await toggleAvailability(id, next);
      } catch (err) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_available: current } : i)));
        clientToast({ kind: "err", label: err instanceof Error ? err.message : "İşlem başarısız" });
      }
    });
  }

  function handleToggleSoldOut(id: string, current: boolean) {
    const next = !current;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, sold_out: next } : i)));
    startTransition(async () => {
      try {
        await toggleSoldOut(id, next);
      } catch (err) {
        setItems((prev) => prev.map((i) => (i.id === id ? { ...i, sold_out: current } : i)));
        clientToast({ kind: "err", label: err instanceof Error ? err.message : "İşlem başarısız" });
      }
    });
  }

  function performDelete(item: Item) {
    setConfirmDelete(null);
    setDeletingId(item.id);
    const snapshot = items;
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setDeletingId(null);
    }, 200);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", item.id);
        await deleteItem(fd);
        clientToast({ kind: "ok", label: "Ürün silindi" });
      } catch (err) {
        setItems(snapshot);
        clientToast({ kind: "err", label: err instanceof Error ? err.message : "Silme başarısız" });
      }
    });
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ürün veya kategori ara…"
          className="flex-1 max-w-sm border-2 border-green bg-bg px-3 py-2 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
        />
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green/60">
          {filtered.length} / {items.length}
        </span>
      </div>

      <div className="border-2 border-green bg-white overflow-x-auto">
        <div className="min-w-xl">
          <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[13px] font-extrabold uppercase tracking-[0.18em] text-green">
            <div></div>
            <div>Ad</div>
            <div>Kategori</div>
            <div className="text-right">Fiyat</div>
            <div className="text-center">Tükendi</div>
            <div></div>
          </div>
          {filtered.map((item) => (
            <div
              key={item.id}
              className={[
                "grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_6rem_5rem_8rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0 transition-all duration-200",
                deletingId === item.id ? "opacity-0 scale-95" : "opacity-100",
              ].join(" ")}
            >
              <div className="w-10 h-10 bg-bg-deep border border-green/20 overflow-hidden flex items-center justify-center shrink-0">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-green/20 text-[18px]">🍽</span>
                )}
              </div>
              <div>
                <div className="font-bowlby text-[20px] uppercase text-green leading-none">{item.name_en}</div>
                {item.spicy && (
                  <div className="mt-1">
                    <span className="inline-block bg-orange text-white text-[8px] font-extrabold px-1.5 py-0.5 uppercase tracking-[0.15em]">
                      Acılı
                    </span>
                  </div>
                )}
              </div>
              <div className="font-bowlby text-[20px] uppercase text-green/80 leading-none">{item.category_name}</div>
              <div className="text-right font-ui font-extrabold text-[16px] text-orange">
                {Number(item.price).toFixed(0)} ₺
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => handleToggleSoldOut(item.id, item.sold_out)}
                  aria-label={item.sold_out ? "Stoğa al" : "Tükendi olarak işaretle"}
                  style={{
                    position: "relative",
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: "none",
                    cursor: "pointer",
                    backgroundColor: item.sold_out ? "#CC2222" : "#ccc",
                    transition: "background-color 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 3,
                      left: item.sold_out ? 19 : 3,
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      backgroundColor: "white",
                      transition: "left 0.2s",
                    }}
                  />
                </button>
              </div>
              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/menu/${item.id}/edit`}
                  className="border-2 border-green text-green bg-transparent px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
                >
                  Düzenle
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(item)}
                  className="bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer"
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center text-[12px] text-green/60 font-semibold uppercase tracking-[0.18em]">
              {items.length === 0 ? "Henüz menü ürünü yok" : "Sonuç bulunamadı"}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Ürünü sil?"
        body={confirmDelete ? `"${confirmDelete.name_en}" kalıcı olarak silinecek. Bu işlem geri alınamaz.` : undefined}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={() => confirmDelete && performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </>
  );
}

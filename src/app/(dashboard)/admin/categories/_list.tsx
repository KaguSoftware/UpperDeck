"use client";

import React, { useState, useTransition, useRef } from "react";
import Link from "next/link";
import { GhostButton } from "../_components";
import { deleteCategory, moveCategoryUp, moveCategoryDown } from "./actions";
import { ConfirmDialog } from "@/components/ConfirmDialog/components";
import { clientToast } from "@/lib/admin/client-notify";

type Cat = {
  id: string;
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
  image_url: string | null;
  emoji: string | null;
  parent_id: string | null;
};

export function CategoriesList({ initial }: { initial: Cat[] }) {
  const [cats, setCats] = useState(initial);
  const [, startTransition] = useTransition();
  const movingId = useRef<string | null>(null);
  const [animatingId, setAnimatingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Cat | null>(null);

  function performDelete(c: Cat) {
    const snapshot = cats;
    setConfirmDelete(null);
    setCats((prev) => prev.filter((x) => x.id !== c.id));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", c.id);
        await deleteCategory(fd);
        clientToast({ kind: "ok", label: "Kategori silindi" });
      } catch (err) {
        setCats(snapshot);
        clientToast({ kind: "err", label: err instanceof Error ? err.message : "Silme başarısız" });
      }
    });
  }

  const parents = cats.filter((c) => !c.parent_id).sort((a, b) => a.sort_order - b.sort_order);
  const childrenOf = (pid: string) => cats.filter((c) => c.parent_id === pid);

  function optimisticMove(id: string, direction: "up" | "down") {
    if (movingId.current) return;
    movingId.current = id;
    setAnimatingId(id);

    setCats((prev) => {
      const moving = prev.find((c) => c.id === id);
      if (!moving) return prev;

      // Scope to same level: same parent_id (or both null)
      const peers = prev
        .filter((c) => c.parent_id === moving.parent_id)
        .sort((a, b) => a.sort_order - b.sort_order);

      const idx = peers.findIndex((c) => c.id === id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= peers.length) return prev;

      const newPeers = [...peers];
      const tmp = newPeers[idx].sort_order;
      newPeers[idx] = { ...newPeers[idx], sort_order: newPeers[swapIdx].sort_order };
      newPeers[swapIdx] = { ...newPeers[swapIdx], sort_order: tmp };

      const peerIds = new Set(newPeers.map((c) => c.id));
      return [...prev.filter((c) => !peerIds.has(c.id)), ...newPeers];
    });

    setTimeout(() => setAnimatingId(null), 300);

    startTransition(async () => {
      if (direction === "up") await moveCategoryUp(id);
      else await moveCategoryDown(id);
      movingId.current = null;
    });
  }

  function Row({ c, indent }: { c: Cat; indent?: boolean }) {
    const isAnimating = animatingId === c.id;
    return (
      <div
        className={[
          "grid grid-cols-[4rem_3rem_1fr_1fr_1fr_12rem] gap-3 items-center px-4 py-3 border-b border-green/20 last:border-b-0 transition-all duration-300",
          indent ? "bg-bg-deep/40 pl-10" : "",
          isAnimating ? "bg-green/10" : "",
        ].join(" ")}
      >
        <div className="flex items-center gap-1">
          <span className="font-bowlby text-[18px] text-orange leading-none w-6">{c.sort_order}</span>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => optimisticMove(c.id, "up")}
              className="block w-5 h-5 text-[10px] leading-none text-green/60 hover:text-green cursor-pointer active:scale-125 transition-transform"
            >▲</button>
            <button
              type="button"
              onClick={() => optimisticMove(c.id, "down")}
              className="block w-5 h-5 text-[10px] leading-none text-green/60 hover:text-green cursor-pointer active:scale-125 transition-transform"
            >▼</button>
          </div>
        </div>
        <div className="w-10 h-10 bg-bg-deep border border-green/20 overflow-hidden flex items-center justify-center shrink-0">
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[22px]">{c.emoji ?? "📁"}</span>
          )}
        </div>
        <div className="font-mono text-[14px] text-green/80">
          {indent && <span className="text-green/30 mr-1">↳</span>}{c.slug}
        </div>
        <div className="font-bowlby text-[20px] uppercase text-green leading-none">{c.name_en}</div>
        <div className="font-bowlby text-[20px] uppercase text-green leading-none">{c.name_tr}</div>
        <div className="flex justify-end gap-2 flex-wrap">
          {!indent && (
            <Link
              href={`/admin/categories/new?parent=${c.id}`}
              className="border-2 border-green text-green bg-transparent px-2 py-1 font-ui font-extrabold text-[9px] tracking-[0.18em] uppercase whitespace-nowrap"
            >
              + Alt
            </Link>
          )}
          <GhostButton href={`/admin/categories/${c.id}/edit`}>Düzenle</GhostButton>
          <button
            type="button"
            onClick={() => setConfirmDelete(c)}
            className="bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer"
          >
            Sil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-green bg-white overflow-x-auto">
      <div className="min-w-xl">
        <div className="grid grid-cols-[4rem_3rem_1fr_1fr_1fr_12rem] gap-3 px-4 py-3 border-b-2 border-green bg-bg-deep text-[13px] font-extrabold uppercase tracking-[0.18em] text-green">
          <div>Sıra</div>
          <div></div>
          <div>Slug</div>
          <div>İNG</div>
          <div>TR</div>
          <div></div>
        </div>

        {parents.map((parent) => (
          <React.Fragment key={parent.id}>
            <Row c={parent} />
            {childrenOf(parent.id).map((child) => (
              <Row key={child.id} c={child} indent />
            ))}
          </React.Fragment>
        ))}

        {cats.filter((c) => c.parent_id && !cats.find((p) => p.id === c.parent_id)).map((c) => (
          <Row key={c.id} c={c} indent />
        ))}

        {cats.length === 0 && (
          <div className="px-4 py-10 text-center text-[12px] text-green/60 font-semibold uppercase tracking-[0.18em]">
            Henüz kategori yok
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Kategoriyi sil?"
        body={confirmDelete ? `"${confirmDelete.name_en}" silinecek. Bu kategoriye bağlı ürünler etkilenebilir. Bu işlem geri alınamaz.` : undefined}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={() => confirmDelete && performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

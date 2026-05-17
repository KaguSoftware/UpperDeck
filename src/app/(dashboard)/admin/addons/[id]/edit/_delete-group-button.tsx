"use client";

import { useRef, useState } from "react";
import { deleteGroup } from "../../actions";
import { DangerButton } from "../../../_components";
import { ConfirmDialog } from "@/components/ConfirmDialog/components";

export function DeleteGroupButton({ groupId, groupLabel }: { groupId: string; groupLabel: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={deleteGroup} className="mt-4">
        <input type="hidden" name="id" value={groupId} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer flex items-center gap-1.5"
        >
          Grubu ve Tüm Seçenekleri Sil
        </button>
      </form>

      <ConfirmDialog
        open={open}
        title="Grubu sil?"
        body={`"${groupLabel}" grubu ve tüm seçenekleri kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
        confirmLabel="Sil"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={() => { setOpen(false); formRef.current?.requestSubmit(); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

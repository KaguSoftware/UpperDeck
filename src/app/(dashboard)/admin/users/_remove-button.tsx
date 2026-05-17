"use client";

import { useRef, useState } from "react";
import { removeUser } from "./actions";
import { ConfirmDialog } from "@/components/ConfirmDialog/components";

export function RemoveButton({ userId, email }: { userId: string; email: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={removeUser}>
        <input type="hidden" name="user_id" value={userId} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-2 border-orange text-orange font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase px-3 py-2 bg-transparent cursor-pointer hover:bg-orange hover:text-white transition-colors"
        >
          Kaldır
        </button>
      </form>

      <ConfirmDialog
        open={open}
        title="Kullanıcıyı kaldır?"
        body={`${email} kaldırılsın mı? Bu işlem geri alınamaz.`}
        confirmLabel="Kaldır"
        cancelLabel="Vazgeç"
        destructive
        onConfirm={() => { setOpen(false); formRef.current?.requestSubmit(); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

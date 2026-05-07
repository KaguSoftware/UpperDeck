"use client";

import { useActionState } from "react";
import { Field, PrimaryButton } from "../_components";
import { RoleToggle } from "./_role-toggle";
import { inviteUser } from "./actions";

export function InviteForm() {
  const [state, action] = useActionState(inviteUser, { error: null, success: false });

  return (
    <section className="mb-8">
      <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-green/70 mb-3">
        Yeni Personel Davet Et
      </div>
      <form action={action} className="border-2 border-green bg-white p-5 max-w-2xl">
        {state.error && (
          <div className="bg-orange text-white text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2 mb-4">
            {state.error}
          </div>
        )}
        {state.success && (
          <div className="bg-green text-bg text-[11px] font-extrabold uppercase tracking-[0.12em] px-3 py-2 mb-4">
            Davet başarıyla gönderildi
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end mb-4">
          <Field label="E-posta" name="email" type="email" required />
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Rol
            </span>
            <RoleToggle defaultRole="admin" />
          </div>
        </div>
        <PrimaryButton>Davet Gönder</PrimaryButton>
      </form>
    </section>
  );
}

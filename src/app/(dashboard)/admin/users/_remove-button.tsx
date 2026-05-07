"use client";

import { removeUser } from "./actions";

export function RemoveButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form
      action={removeUser}
      onSubmit={(e) => {
        if (!confirm(`${email} kaldırılsın mı? Bu işlem geri alınamaz.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="user_id" value={userId} />
      <button
        type="submit"
        className="border-2 border-orange text-orange font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase px-3 py-2 bg-transparent cursor-pointer hover:bg-orange hover:text-white transition-colors"
      >
        Kaldır
      </button>
    </form>
  );
}

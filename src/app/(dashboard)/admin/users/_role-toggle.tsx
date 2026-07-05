"use client";

import { useState } from "react";

type ToggleRole = "admin" | "owner" | "dev";

const roles: ToggleRole[] = ["admin", "owner", "dev"];

const descriptions: Record<ToggleRole, string> = {
  owner: "Kullanıcı yönetimi dahil tam erişim",
  admin: "Yalnızca menü, siparişler ve ayarlar",
  dev: "Tüm yetkiler + Analitik sekmesi",
};

export function RoleToggle({
  defaultRole,
  name,
}: {
  defaultRole: ToggleRole;
  name?: string;
}) {
  const [selected, setSelected] = useState<ToggleRole>(defaultRole);

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name ?? "role"} value={selected} />
      <div className="flex">
        {roles.map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={() => setSelected(r)}
            style={i < roles.length - 1 ? { borderRight: "none" } : undefined}
            className={[
              "border-2 px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.18em] uppercase cursor-pointer",
              selected === r
                ? "bg-green text-bg border-green"
                : "bg-transparent text-green border-green/30 hover:border-green",
            ].join(" ")}
          >
            {r}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-green/50">{descriptions[selected]}</p>
    </div>
  );
}

"use client";

import { useState } from "react";

const descriptions: Record<string, string> = {
  owner: "Full access including user management",
  admin: "Menu, orders & settings only",
};

export function RoleToggle({
  defaultRole,
  name,
}: {
  defaultRole: "admin" | "owner";
  name?: string;
}) {
  const [selected, setSelected] = useState<"admin" | "owner">(defaultRole);

  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name={name ?? "role"} value={selected} />
      <div className="flex">
        {(["admin", "owner"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setSelected(r)}
            style={r === "admin" ? { borderRight: "none" } : undefined}
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

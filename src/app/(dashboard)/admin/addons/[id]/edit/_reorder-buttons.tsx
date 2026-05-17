"use client";

import { useTransition } from "react";
import { reorderOption } from "../../actions";
import { Loader } from "@/components/Loader/components";

export function ReorderButtons({
  optId,
  groupId,
  isFirst,
  isLast,
}: {
  optId: string;
  groupId: string;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [upPending, startUp] = useTransition();
  const [downPending, startDown] = useTransition();

  function move(direction: "up" | "down") {
    const fd = new FormData();
    fd.set("id", optId);
    fd.set("group_id", groupId);
    fd.set("direction", direction);
    if (direction === "up") startUp(() => reorderOption(fd));
    else startDown(() => reorderOption(fd));
  }

  const btnBase = "w-7 h-7 border-2 border-green/30 bg-transparent text-green font-bowlby text-[12px] grid place-items-center cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed hover:border-green transition-colors";

  return (
    <div className="flex flex-col gap-1 pt-5 shrink-0">
      <button
        type="button"
        onClick={() => move("up")}
        disabled={isFirst || upPending || downPending}
        className={btnBase}
      >
        {upPending ? <Loader size="xs" /> : "▲"}
      </button>
      <button
        type="button"
        onClick={() => move("down")}
        disabled={isLast || upPending || downPending}
        className={btnBase}
      >
        {downPending ? <Loader size="xs" /> : "▼"}
      </button>
    </div>
  );
}

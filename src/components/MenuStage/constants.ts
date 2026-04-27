import type { Size } from "@/components/MenuCard/types";

export const SIZE_PX: Record<Size, { w: number; h: number }> = {
  "size-s": { w: 112, h: 148 },
  "size-m": { w: 120, h: 170 },
  "size-l": { w: 150, h: 210 },
};

export const MIN_GAP = 6;
export const MAX_GAP = 14;
export const SIDE_MARGIN = 8;
export const ROTATION_RANGE = 2.5;
export const Y_JITTER = 6;

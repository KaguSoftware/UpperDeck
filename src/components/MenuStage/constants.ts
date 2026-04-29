import type { Size } from "@/components/MenuCard/types";

export const SIZE_PX: Record<Size, { w: number; h: number }> = {
  "size-s": { w: 112, h: 112 },
  "size-m": { w: 140, h: 140 },
  "size-l": { w: 168, h: 168 },
};

export const MIN_GAP = 6;
export const MAX_GAP = 14;
export const SIDE_MARGIN = 8;
export const ROTATION_RANGE = 2.5;
export const Y_JITTER = 6;

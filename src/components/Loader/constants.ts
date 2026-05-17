import type { LoaderSize } from "./types";

export const LOGO_SRC = "/upperdeck-logo.png";

export const SIZE_MAP: Record<LoaderSize, { logo: number; ring: number; stroke: number }> = {
  xs: { logo: 14, ring: 20, stroke: 2 },
  sm: { logo: 28, ring: 40, stroke: 2.5 },
  md: { logo: 52, ring: 72, stroke: 3 },
  lg: { logo: 88, ring: 120, stroke: 4 },
};

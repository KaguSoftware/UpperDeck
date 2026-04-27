import type { MenuItem } from "@/components/MenuStage/types";

export type Size = "size-s" | "size-m" | "size-l";
export type Fill = "green-fill" | "orange-fill" | "";

export type PlacedCard = MenuItem & {
  sz: Size;
  fill: Fill;
  rot: number;
  w: number;
  h: number;
  x: number;
  y: number;
};

export type MenuCardProps = {
  card: PlacedCard;
  index: number;
  onOpen: (card: PlacedCard) => void;
};

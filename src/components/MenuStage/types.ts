import type { PlacedCard } from "@/components/MenuCard/types";

export type LayoutResult = {
  placed: PlacedCard[];
  totalH: number;
};

export type MenuStageProps = {
  stageWidth: number;
  onOpen: (card: PlacedCard) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  catLabel: (cat: string) => string;
  itemLabel: (count: number) => string;
};

export type SectionData = {
  cat: string;
  placed: PlacedCard[];
  totalH: number;
};

import type { PlacedCard } from "@/components/MenuCard/types";

export type MenuItem = {
  cat: string;
  name: string;
  price: number;
  image_url: string | null;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  hook: string;
  desc: string;
  spicy?: boolean;
};

export type LayoutResult = {
  placed: PlacedCard[];
  totalH: number;
};

export type MenuStageProps = {
  stageWidth: number;
  onOpen: (card: PlacedCard) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  categories: { slug: string; name: string }[];
  items: MenuItem[];
  itemLabel: (count: number) => string;
};

export type SectionData = {
  cat: string;
  placed: PlacedCard[];
  totalH: number;
};

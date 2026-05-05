import type { PlacedCard } from "@/components/MenuCard/types";

export type MenuItem = {
  id: string;
  cat: string;
  subcat?: string | null;
  name: string;
  price: number;
  image_url: string | null;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  hook: string;
  desc: string;
  spicy?: boolean;
  sold_out?: boolean;
  discountPct?: number | null;
  addonGroupKey?: string | null;
};

export type LayoutResult = {
  placed: PlacedCard[];
  totalH: number;
};

export type MenuStageProps = {
  onOpen: (card: PlacedCard) => void;
  stageRef: React.RefObject<HTMLDivElement | null>;
  categories: { slug: string; name: string; emoji: string | null; image_url: string | null; subcategories: { slug: string; name: string }[] }[];
  items: MenuItem[];
  itemLabel: (count: number) => string;
  featuredItemId?: string | null;
  featuredDiscount?: number | null;
};

export type SectionData = {
  cat: string;
  placed: PlacedCard[];
  totalH: number;
};

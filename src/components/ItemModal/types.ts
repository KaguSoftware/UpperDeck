import type { PlacedCard } from "@/components/MenuCard/types";

export type ItemModalProps = {
  item: PlacedCard | null;
  onClose: () => void;
  onAdd: () => void;
  spicyLabel: string;
  priceLabel: string;
  addToOrderLabel: string;
};

import type { PlacedCard } from "@/components/MenuCard/types";
import type { AddonGroup, AddonOption } from "./addons";

export type { AddonGroup, AddonOption };

export type ItemModalProps = {
  item: PlacedCard | null;
  onClose: () => void;
  onAdd: (extras: AddonOption[]) => void;
  spicyLabel: string;
  priceLabel: string;
  addToOrderLabel: string;
  addonGroups?: AddonGroup[];
};

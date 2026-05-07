import type { PlacedCard } from "@/components/MenuCard/types";
import type { AddonGroupPublic, AddonOptionPublic } from "@/lib/menu/queries";

export type AddonGroup  = AddonGroupPublic;
export type AddonOption = AddonOptionPublic;

export type ItemModalProps = {
  item: PlacedCard | null;
  onClose: () => void;
  onAdd: (extras: AddonOptionPublic[]) => void;
  spicyLabel: string;
  priceLabel: string;
  addToOrderLabel: string;
  addonGroups?: AddonGroupPublic[];
};

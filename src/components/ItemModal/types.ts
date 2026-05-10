import type { PlacedCard } from "@/components/MenuCard/types";
import type { AddonGroupPublic, AddonOptionPublic, SuggestedItemPublic } from "@/lib/menu/queries";

export type AddonGroup  = AddonGroupPublic;
export type AddonOption = AddonOptionPublic;

export type ItemModalProps = {
  item: PlacedCard | null;
  onClose: () => void;
  onAdd: (extras: (AddonOptionPublic & { required?: boolean; groupLabel?: string })[], itemNote: string) => void;
  onSuggestedClick: (item: SuggestedItemPublic) => void;
  spicyLabel: string;
  priceLabel: string;
  addToOrderLabel: string;
  specialInstructionsLabel: string;
  specialInstructionsPlaceholder: string;
  addonGroups?: AddonGroupPublic[];
  suggestedItems?: SuggestedItemPublic[];
  alsoTryLabel?: string;
};

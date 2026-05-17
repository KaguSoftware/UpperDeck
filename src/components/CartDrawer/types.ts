export type CartItemExtra = { id: string; label: string; price: number; required?: boolean; groupLabel?: string };

export type CartItem = {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  qty: number;
  extras?: CartItemExtra[];
  itemNote?: string;
};

export type CouponProps = {
  couponLabel: string;
  couponPlaceholder: string;
  couponApply: string;
  noOfferTitle: string;
  noOfferBody: string;
  emailPlaceholder: string;
  subscribeLabel: string;
  subscribedMessage: string;
  noCouponPrefix: string;
  noCouponLink: string;
};

export type CartDrawerProps = {
  items: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onTableChange: (n: number | null) => void;
  onNoteChange: (s: string) => void;
  tableNumber: number | null;
  note: string;
  totalLabel: string;
  subtotalLabel: string;
  emptyLabel: string;
  tableLabel: string;
  tableFromQrLabel: string;
  notePlaceholder: string;
  callWaiterLabel: string;
  callWaiterSendingLabel: string;
  callWaiterHeadedLabel: string;
  onCallWaiter: () => void;
  waiterCooldownSeconds: number;
  waiterCooldownLabel: string;
  submitting?: boolean;
  tableFromQr?: boolean;
  topOffset?: number;
  coupon: CouponProps;
};

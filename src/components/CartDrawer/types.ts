export type CartItem = {
  id: string;
  menu_item_id: string;
  name: string;
  price: number;
  qty: number;
};

export type CheckoutState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "offline" }
  | { status: "validation"; message: string };

export type CartDrawerProps = {
  items: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onTableChange: (n: number | null) => void;
  onNoteChange: (s: string) => void;
  onCheckout: () => void;
  onRetry: () => void;
  tableNumber: number | null;
  note: string;
  checkoutState: CheckoutState;
  totalLabel: string;
  subtotalLabel: string;
  emptyLabel: string;
  tableLabel: string;
  tableFromQrLabel: string;
  notePlaceholder: string;
  sendLabel: string;
  tryAgainLabel: string;
  tableFromQr?: boolean;
  simulateFailure?: boolean;
  onSimulateFailureChange?: (v: boolean) => void;
};

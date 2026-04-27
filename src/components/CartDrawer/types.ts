export type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

export type CartDrawerProps = {
  items: CartItem[];
  isOpen: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  totalLabel: string;
  emptyLabel: string;
};

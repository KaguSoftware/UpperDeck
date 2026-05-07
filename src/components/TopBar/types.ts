import type { Locale } from "@/i18n/config";

export type TopBarProps = {
  cartCount: number;
  onCartClick: () => void;
  onTopClick: () => void;
  brandMain: string;
  brandAccent: string;
  brandSub: string;
  orderLabel: string;
  locale: Locale;
};

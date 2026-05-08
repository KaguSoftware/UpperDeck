export type HeroProps = {
  collapsed: boolean;
  itemCount: number;
  headline1: string;
  headline2: string;
  headline3: string;
  headline4: string;
  openHours: string;
  itemsLabel: string;
  heroMode?: "none" | "media" | "featured";
  heroMediaUrl?: string | null;

  featuredItem?: { id: string; name: string; image_url: string | null; emoji: string; price?: number } | null;
  featuredLabel?: string | null;
  featuredBadge?: string | null;
  featuredDiscount?: number | null;
  onFeaturedClick?: () => void;
};

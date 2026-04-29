export type FilterPillsProps = {
  items: { id: string; label: string; image_url?: string | null; emoji?: string | null }[];
  activeId: string;
  onSelect: (id: string, btn: HTMLButtonElement) => void;
  navRef?: React.RefObject<HTMLElement | null>;
  compact?: boolean;
};

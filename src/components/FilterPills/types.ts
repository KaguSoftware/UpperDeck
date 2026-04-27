export type FilterPillsProps = {
  items: { id: string; label: string }[];
  activeId: string;
  onSelect: (id: string, btn: HTMLButtonElement) => void;
  navRef?: React.RefObject<HTMLElement | null>;
};

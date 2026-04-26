export type FilterPillsProps = {
  categories: string[];
  active: string;
  onSelect: (cat: string, btn: HTMLButtonElement) => void;
};

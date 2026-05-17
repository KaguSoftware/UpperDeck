// Master list of physical tables. Order here drives the QR sheet print order.
// `""` is reserved as the "no table / unknown" sentinel (e.g. when an order
// is placed before scanning a QR). Do not use `""` here.
export const TABLE_IDS: readonly string[] = [
  "S1", "S2", "S3", "S4",
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10",
  "KAMARA",
  "KAMARA 1", "KAMARA 4", "KAMARA 6", "KAMARA 7", "KAMARA 8",
  "KAMARA 9", "KAMARA 10", "KAMARA 11", "KAMARA 12", "KAMARA 13",
  "KAMARA 14", "KAMARA 15", "KAMARA 16",
] as const;

const VALID = new Set<string>(TABLE_IDS);

export function isValidTableId(value: string): boolean {
  return VALID.has(value);
}

// Master list of physical tables. Order here drives the QR sheet print order.
// `""` is reserved as the "no table / unknown" sentinel (e.g. when an order
// is placed before scanning a QR). Do not use `""` here.
export const TABLE_IDS: readonly string[] = [
  "S1", "S2", "S3", "S4",
  "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10",
  "KAMARA",
  "1", "4", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16",
] as const;

const VALID = new Set<string>(TABLE_IDS);

export function isValidTableId(value: string): boolean {
  return VALID.has(value);
}

import { describe, expect, it } from "vitest";
import { TABLE_IDS, isValidTableId } from "./tables";

describe("table ids", () => {
  it("accepts every listed table", () => {
    for (const id of TABLE_IDS) expect(isValidTableId(id)).toBe(true);
  });

  it("rejects the empty 'unknown table' sentinel and made-up tables", () => {
    expect(isValidTableId("")).toBe(false);
    expect(isValidTableId("999")).toBe(false);
    expect(isValidTableId("s1")).toBe(false); // ids are case sensitive
  });

  it("has no duplicate ids, so the QR sheet prints each table once", () => {
    expect(new Set(TABLE_IDS).size).toBe(TABLE_IDS.length);
  });
});

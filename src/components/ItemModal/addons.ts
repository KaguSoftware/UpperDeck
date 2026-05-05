export type AddonOption = { id: string; label: string; price: number };
export type AddonGroup = { label: string; options: AddonOption[]; multi: boolean };

/**
 * Keyed by menu_item_id. Each entry is an array of addon groups shown in the
 * item modal. Groups with multi:false act as single-select (radio), multi:true
 * allows multiple selections (checkboxes).
 *
 * To wire an item: add its UUID from the `menu_items` table as a key here.
 */
export const ADDONS: Record<string, AddonGroup[]> = {
  // Example — replace keys with real menu_item_id UUIDs from your database.
  // "00000000-0000-0000-0000-000000000001": [
  //   {
  //     label: "Side",
  //     multi: false,
  //     options: [
  //       { id: "fries",       label: "Fries",        price: 30 },
  //       { id: "onion-rings", label: "Onion Rings",  price: 35 },
  //       { id: "salad",       label: "Side Salad",   price: 25 },
  //     ],
  //   },
  //   {
  //     label: "Sauce",
  //     multi: true,
  //     options: [
  //       { id: "bbq",         label: "BBQ",          price: 0  },
  //       { id: "ranch",       label: "Ranch",        price: 0  },
  //       { id: "chipotle",    label: "Chipotle Mayo", price: 0 },
  //       { id: "honey-mustard", label: "Honey Mustard", price: 0 },
  //     ],
  //   },
  // ],
};

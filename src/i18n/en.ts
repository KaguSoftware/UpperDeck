type EnShape = {
  brand: { name: { main: string; accent: string }; sub: string };
  hero: {
    headline1: string;
    headline2: string;
    headline3: string;
    headline4: string;
    openHours: string;
    items: string;
  };
  topbar: { order: string };
  filter: { all: string };
  stage: { item: string; items: string };
  modal: { spicy: string; price: string; addToOrder: string };
  toast: {
    empty: string;
    itemsOnDeckOne: string;
    itemsOnDeckMany: string;
    addedPrefix: string;
  };
  ticker: string[];
  categories: Record<string, string>;
};

const en: EnShape = {
  brand: {
    name: { main: "UPPER", accent: "DECK" },
    sub: "American Diner",
  },
  hero: {
    headline1: "Burgers,",
    headline2: "waffles",
    headline3: "& whatever",
    headline4: "else.",
    openHours: "Open · 09:00 — 23:30",
    items: "items",
  },
  topbar: {
    order: "Order",
  },
  filter: {
    all: "All",
  },
  stage: {
    item: "item",
    items: "items",
  },
  modal: {
    spicy: "Spicy",
    price: "Price",
    addToOrder: "Add to Order",
  },
  toast: {
    empty: "Your order is empty",
    itemsOnDeckOne: "{count} item on the deck",
    itemsOnDeckMany: "{count} items on the deck",
    addedPrefix: "Added · ",
  },
  ticker: [
    "Smashed Burgers",
    "Hand-Pulled Wings",
    "Buttermilk Tenders",
    "Real Milkshakes",
    "Fresh Lemonade",
    "Truffle Fries",
    "Sweet · Savory · Smoky",
    "Open Late",
    "Order at the Counter",
  ],
  categories: {
    Breakfast: "Breakfast",
    Chicken: "Chicken",
    Burger: "Burger",
    "Dog-Bun": "Dog-Bun",
    Veggy: "Veggy",
    Shared: "Shared",
    "French Toast": "French Toast",
    Waffles: "Waffles",
    Pancakes: "Pancakes",
    Mocktails: "Mocktails",
    Milkshakes: "Milkshakes",
    "Hot Drinks": "Hot Drinks",
    "Cold Drinks": "Cold Drinks",
  },
};

export default en;
export type Messages = EnShape;

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
  modal: { spicy: string; price: string; addToOrder: string; specialInstructions: string; specialInstructionsPlaceholder: string; alsoTry: string; required: string; requiredMissing: string };
  coupon: { label: string; placeholder: string; apply: string; noOfferTitle: string; noOfferBody: string; emailPlaceholder: string; subscribe: string; subscribed: string; noCouponPrefix: string; noCouponLink: string };
  cart: {
    title: string;
    table_number: string;
    table_from_qr: string;
    note_placeholder: string;
    callWaiter: string;
    continueBrowsing: string;
    sending: string;
    headed: string;
    waiterCalled: string;
    error_send: string;
    subtotal: string;
    error_validation: string;
    error_no_table: string;
  };
  toast: {
    empty: string;
    itemsOnDeckOne: string;
    itemsOnDeckMany: string;
    addedPrefix: string;
    orderSentPrefix: string;
  };
  ticker: string[];
  categories: Record<string, string>;
  waiter: { title: string; bill: string; call: string; cancel: string; notified: string };
  qrRequired: { title: string; body: string };
  bellTutorial: { eyebrow: string; title: string; dismissHint: string };
  offline: { banner: string };
};

const en: EnShape = {
  brand: {
    name: { main: "UPPER", accent: "DECK" },
    sub: "American Diner",
  },
  hero: {
    headline1: "Burgers,",
    headline2: "waffles",
    headline3: "whatever",
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
    specialInstructions: "Special Instructions",
    specialInstructionsPlaceholder: "e.g. no onions, extra sauce…",
    alsoTry: "Also try this",
    required: "Required",
    requiredMissing: "Required",
  },
  cart: {
    title: "Your Order",
    table_number: "Table number",
    table_from_qr: "from QR",
    note_placeholder: "Special requests, allergies…",
    callWaiter: "Call Waiter",
    continueBrowsing: "Browse the menu",
    sending: "Sending…",
    headed: "A waiter is headed your way to place your order!",
    waiterCalled: "Waiter notified — on the way!",
    error_send: "Couldn't reach the staff. Please try again.",
    subtotal: "Subtotal",
    error_validation: "Something looks wrong with your order. Please check and try again.",
    error_no_table: "Scan your table QR code or enter a table number to place your order.",
  },
  toast: {
    empty: "Your order is empty",
    itemsOnDeckOne: "{count} item on the deck",
    itemsOnDeckMany: "{count} items on the deck",
    addedPrefix: "Added · ",
    orderSentPrefix: "Order received! Table ",
  },
  coupon: {
    label: "Coupon Code",
    placeholder: "ENTER CODE",
    apply: "Apply",
    noOfferTitle: "No offer found",
    noOfferBody: "Subscribe to our newsletter and be the first to get exclusive deals.",
    emailPlaceholder: "your@email.com",
    subscribe: "Subscribe",
    subscribed: "You're in! We'll be in touch.",
    noCouponPrefix: "No coupon? Subscribe to our newsletter",
    noCouponLink: "here",
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
  waiter: {
    title: "Call Waiter",
    bill: "Hesap (Bill)",
    call: "Call Waiter",
    cancel: "Cancel",
    notified: "Waiter notified",
    failed: "Couldn't reach staff — please flag someone down.",
  },
  qrRequired: {
    title: "Please scan QR code",
    body: "Scan the QR code on your table to place an order or call a waiter.",
  },
  bellTutorial: {
    eyebrow: "Need anything?",
    title: "Tap the bell — we'll come right over.",
    dismissHint: "tap anywhere to continue",
  },
  offline: {
    banner: "You're offline — actions won't go through until you reconnect",
  },
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

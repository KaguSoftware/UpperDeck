export type MenuItem = {
  cat: string;
  name: string;
  price: number;
  emoji: string;
  desc: string;
  spicy?: boolean;
};

export const MENU: MenuItem[] = [
  { cat: "Breakfast", name: "Deck Plate", price: 580, emoji: "🍳", desc: "hearty · loaded · classic" },
  { cat: "Breakfast", name: "Sweety Deck Plate", price: 490, emoji: "🥞", desc: "sweet · syrupy · golden" },
  { cat: "Breakfast", name: "Fresh Deck Plate", price: 490, emoji: "🥑", desc: "fresh · green · bright" },
  { cat: "Chicken", name: "Crispy Burger", price: 350, emoji: "🍔", desc: "crunchy · juicy · golden" },
  { cat: "Chicken", name: "Red Dead Crispy", price: 400, emoji: "🔥", desc: "fiery · crispy · bold", spicy: true },
  { cat: "Chicken", name: "Hot Wings", price: 410, emoji: "🍗", desc: "sticky · hot · messy", spicy: true },
  { cat: "Chicken", name: "Crisp Up Tenders", price: 370, emoji: "🍗", desc: "tender · crunchy · classic" },
  { cat: "Chicken", name: "Red Dead Tenders", price: 390, emoji: "🌶️", desc: "tender · spicy · sharp", spicy: true },
  { cat: "Chicken", name: "Lemon Pepper Wings", price: 420, emoji: "🍋", desc: "zesty · peppery · sharp" },
  { cat: "Burger", name: "Simple Burger", price: 430, emoji: "🍔", desc: "clean · classic · solid" },
  { cat: "Burger", name: "Deck MAC", price: 440, emoji: "🧀", desc: "cheesy · stacked · saucy" },
  { cat: "Burger", name: "Kansas Burger", price: 450, emoji: "🌶️", desc: "smoky · spicy · midwest", spicy: true },
  { cat: "Burger", name: "Truffle Burger", price: 450, emoji: "🍄", desc: "earthy · rich · luxe" },
  { cat: "Burger", name: "Upperdeck Burger", price: 490, emoji: "🍔", desc: "signature · loaded · iconic" },
  { cat: "Burger", name: "Berries Burger", price: 495, emoji: "🫐", desc: "tangy · sweet · bold" },
  { cat: "Burger", name: "Simple Smash", price: 490, emoji: "🥩", desc: "smashed · crusty · juicy" },
  { cat: "Burger", name: "Oklahama Onion", price: 490, emoji: "🧅", desc: "sweet · charred · crispy" },
  { cat: "Burger", name: "Wild Eggy", price: 510, emoji: "🍳", desc: "runny · rich · wild" },
  { cat: "Burger", name: "Deck Smash", price: 490, emoji: "🍔", desc: "double · smash · stacked" },
  { cat: "Dog-Bun", name: "BBQ Dog", price: 440, emoji: "🌭", desc: "smoky · saucy · bold" },
  { cat: "Dog-Bun", name: "Philly Cheese", price: 450, emoji: "🥖", desc: "steaky · cheesy · classic" },
  { cat: "Veggy", name: "Veggy Bun", price: 350, emoji: "🥬", desc: "green · light · fresh" },
  { cat: "Veggy", name: "Deck Salata", price: 250, emoji: "🥗", desc: "crisp · fresh · clean" },
  { cat: "Shared", name: "Crisp Up Onions", price: 300, emoji: "🧅", desc: "crispy · golden · crunchy" },
  { cat: "Shared", name: "Patates", price: 150, emoji: "🍟", desc: "salty · crispy · hot" },
  { cat: "Shared", name: "Mac & Cheese", price: 350, emoji: "🧀", desc: "creamy · cheesy · gooey" },
  { cat: "Shared", name: "Truffle Patates", price: 250, emoji: "🍟", desc: "truffled · cheesy · rich" },
  { cat: "Shared", name: "Cheddar Patates", price: 260, emoji: "🍟", desc: "cheesy · loaded · hot" },
  { cat: "French Toast", name: "Brioche Caramel", price: 330, emoji: "🍞", desc: "buttery · caramel · soft" },
  { cat: "French Toast", name: "French Toast", price: 350, emoji: "🍞", desc: "golden · sweet · classic" },
  { cat: "French Toast", name: "Berries Toast", price: 350, emoji: "🍓", desc: "berry · sweet · golden" },
  { cat: "Waffles", name: "Chicky Caramel", price: 410, emoji: "🧇", desc: "chicken · caramel · bold" },
  { cat: "Waffles", name: "Apple Cinnamon", price: 360, emoji: "🍎", desc: "warm · sweet · spiced" },
  { cat: "Waffles", name: "Berries & Cream", price: 360, emoji: "🍦", desc: "cool · berry · sweet" },
  { cat: "Waffles", name: "Nutella Waffle", price: 360, emoji: "🍫", desc: "chocolatey · rich · gooey" },
  { cat: "Waffles", name: "Nashville Waffle", price: 420, emoji: "🌶️", desc: "hot · sweet · southern", spicy: true },
  { cat: "Pancakes", name: "Egg & Smoke", price: 410, emoji: "🥞", desc: "smoky · savory · stacked" },
  { cat: "Pancakes", name: "Banana Pancake", price: 330, emoji: "🍌", desc: "sweet · soft · golden" },
  { cat: "Pancakes", name: "Nutella Pancake", price: 350, emoji: "🥞", desc: "choc · soft · gooey" },
  { cat: "Mocktails", name: "Kuzu Kulağı", price: 200, emoji: "🌿", desc: "herbal · cool · green" },
  { cat: "Mocktails", name: "Sunset", price: 200, emoji: "🌅", desc: "citrus · bright · sweet" },
  { cat: "Mocktails", name: "Red Moon", price: 200, emoji: "🌙", desc: "berry · tart · cool" },
  { cat: "Milkshakes", name: "Vanilya", price: 170, emoji: "🥛", desc: "creamy · sweet · classic" },
  { cat: "Milkshakes", name: "Çilekli", price: 170, emoji: "🍓", desc: "berry · creamy · pink" },
  { cat: "Milkshakes", name: "Oreo Shake", price: 180, emoji: "🍪", desc: "cookie · creamy · rich" },
  { cat: "Milkshakes", name: "Muzlu", price: 175, emoji: "🍌", desc: "banana · creamy · sweet" },
  { cat: "Milkshakes", name: "Yer Fıstıklı", price: 180, emoji: "🥜", desc: "nutty · creamy · rich" },
  { cat: "Milkshakes", name: "Tuzlu Karamel", price: 180, emoji: "🍯", desc: "salty · sweet · golden" },
  { cat: "Hot Drinks", name: "Türk Kahvesi", price: 130, emoji: "☕", desc: "strong · rich · classic" },
  { cat: "Hot Drinks", name: "Caramel Latte", price: 130, emoji: "🥛", desc: "sweet · creamy · warm" },
  { cat: "Hot Drinks", name: "Sıcak Çikolata", price: 150, emoji: "🍫", desc: "choc · creamy · warm" },
  { cat: "Hot Drinks", name: "Çay", price: 40, emoji: "🍵", desc: "hot · classic · simple" },
  { cat: "Cold Drinks", name: "İce Latte", price: 130, emoji: "🧊", desc: "cold · milky · smooth" },
  { cat: "Cold Drinks", name: "Limonata", price: 120, emoji: "🍋", desc: "zesty · cold · sweet" },
  { cat: "Cold Drinks", name: "Coca Cola", price: 80, emoji: "🥤", desc: "fizzy · cold · classic" },
];

export const CATEGORIES = Array.from(new Set(MENU.map((m) => m.cat)));
export const ITEM_COUNT = MENU.length;

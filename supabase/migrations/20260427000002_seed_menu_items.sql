-- Seed menu items for Upperdeck American Diner
-- Categories must already exist (from init migration).
-- Uses CTEs to resolve category slugs → IDs safely.

-- Re-add emoji column (was dropped in migration 20260427000001 in favour of image_url,
-- but we want both: emoji as a placeholder until a real image is uploaded).
alter table public.menu_items
  add column if not exists emoji text not null default '🍽️';

do $$ declare
  cat_breakfast    uuid;
  cat_chicken      uuid;
  cat_burger       uuid;
  cat_dog_bun      uuid;
  cat_veggy        uuid;
  cat_shared       uuid;
  cat_french_toast uuid;
  cat_waffles      uuid;
  cat_pancakes     uuid;
  cat_mocktails    uuid;
  cat_milkshakes   uuid;
  cat_hot_drinks   uuid;
  cat_cold_drinks  uuid;
begin
  select id into cat_breakfast    from public.categories where slug = 'breakfast';
  select id into cat_chicken      from public.categories where slug = 'chicken';
  select id into cat_burger       from public.categories where slug = 'burger';
  select id into cat_dog_bun      from public.categories where slug = 'dog-bun';
  select id into cat_veggy        from public.categories where slug = 'veggy';
  select id into cat_shared       from public.categories where slug = 'shared';
  select id into cat_french_toast from public.categories where slug = 'french-toast';
  select id into cat_waffles      from public.categories where slug = 'waffles';
  select id into cat_pancakes     from public.categories where slug = 'pancakes';
  select id into cat_mocktails    from public.categories where slug = 'mocktails';
  select id into cat_milkshakes   from public.categories where slug = 'milkshakes';
  select id into cat_hot_drinks   from public.categories where slug = 'hot-drinks';
  select id into cat_cold_drinks  from public.categories where slug = 'cold-drinks';

  -- Add extra categories not in init migration
  insert into public.categories (slug, name_en, name_tr, sort_order) values
    ('breakfast-extra', 'Breakfast Extra', 'Kahvaltı Ekstra',    15),
    ('extra',           'Extra',           'Ekstra',             65),
    ('sauces',          'Homemade Sauces', 'El Yapımı Soslar',   66)
  on conflict (slug) do nothing;

  select id into cat_breakfast    from public.categories where slug = 'breakfast';
  select id into cat_chicken      from public.categories where slug = 'chicken';

  -- ── BREAKFAST ──────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_breakfast, 'Deck Plate',       'Deck Plate',       '🍳', 580, 10),
    (cat_breakfast, 'Sweety Deck Plate','Sweety Deck Plate','🍯', 490, 20),
    (cat_breakfast, 'Fresh Deck Plate', 'Fresh Deck Plate', '🥗', 490, 30);

  -- ── BREAKFAST EXTRA ────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order)
  select c.id, t.name_en, t.name_tr, t.emoji, t.price, t.sort_order
  from (values
    ('breakfast-extra', 'Füme Et',             'Füme Et',             '🥩',  120, 10),
    ('breakfast-extra', 'Füme Dana Sosis',     'Füme Dana Sosis',     '🌭',  250, 20),
    ('breakfast-extra', 'Pancake',             'Pankek',              '🥞',   40, 30),
    ('breakfast-extra', 'Göz Yumurta',         'Göz Yumurta',         '🍳',   30, 40),
    ('breakfast-extra', 'Nutella',             'Nutella',             '🍫',   40, 50),
    ('breakfast-extra', 'Cheddar Peyniri',     'Cheddar Peyniri',     '🧀',   30, 60),
    ('breakfast-extra', 'Patates Bravas',      'Patates Bravas',      '🍟',   40, 70),
    ('breakfast-extra', 'French Toast',        'French Toast',        '🍞',  100, 80),
    ('breakfast-extra', 'Brioche Ekmeği',      'Brioche Ekmeği',      '🥐',   30, 90),
    ('breakfast-extra', 'Akçaağaç Şurubu',    'Akçaağaç Şurubu',    '🍁',   40,100),
    ('breakfast-extra', 'Refill Filter Coffee','Refill Filtre Kahve', '☕',    0,110)
  ) as t(slug, name_en, name_tr, emoji, price, sort_order)
  join public.categories c on c.slug = t.slug;

  -- ── CHICKEN ────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, spicy, sort_order) values
    (cat_chicken, 'Crispy Burger',          'Crispy Burger',          '🍗', 350, false, 10),
    (cat_chicken, 'Red Dead Crispy Burger', 'Red Dead Crispy Burger', '🌶️', 400, true,  20),
    (cat_chicken, 'Hot Wings',              'Hot Wings',              '🔥', 410, true,  30),
    (cat_chicken, 'Crisp Up Tenders',       'Crisp Up Tenders',       '🍗', 370, false, 40),
    (cat_chicken, 'Red Dead Tenders',       'Red Dead Tenders',       '🌶️', 390, true,  50),
    (cat_chicken, 'Lemon Pepper Wings',     'Lemon Pepper Wings',     '🍋', 420, false, 60);

  -- ── BURGER ─────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, spicy, sort_order) values
    (cat_burger, 'Simple Burger',      'Simple Burger',      '🍔', 430, false, 10),
    (cat_burger, 'Deck MAC Burger',    'Deck MAC Burger',    '🍔', 440, false, 20),
    (cat_burger, 'Kansas Burger',      'Kansas Burger',      '🌶️', 450, true,  30),
    (cat_burger, 'Truffle Burger',     'Truffle Burger',     '🍄', 450, false, 40),
    (cat_burger, 'Upperdeck Burger',   'Upperdeck Burger',   '🏆', 490, false, 50),
    (cat_burger, 'Berries Burger',     'Berries Burger',     '🍓', 495, false, 60),
    (cat_burger, 'Simple Smash',       'Simple Smash',       '🍔', 490, false, 70),
    (cat_burger, 'Oklahoma Onion',     'Oklahama Onion',     '🧅', 490, false, 80),
    (cat_burger, 'Wild Eggy',          'Wild Eggy',          '🍳', 510, false, 90),
    (cat_burger, 'Deck Smash',         'Deck Smash',         '🍔', 490, false,100);

  -- ── DOG-BUN ────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_dog_bun, 'BBQ Dog',                'BBQ Dog',                '🌭', 440, 10),
    (cat_dog_bun, 'Philly Cheese Steak Bun','Philly Cheese Steak Bun','🥖', 450, 20);

  -- ── VEGGY ──────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_veggy, 'Veggy Bun',   'Veggy Bun',   '🥦', 350, 10),
    (cat_veggy, 'Deck Salata', 'Deck Salata', '🥗', 250, 20);

  -- ── SHARED ─────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_shared, 'Crisp Up Onions',                        'Crisp Up Onions',                        '🧅', 300, 10),
    (cat_shared, 'French Fries',                           'Patates Kızartması',                     '🍟', 150, 20),
    (cat_shared, 'Mac & Cheese',                           'Mac & Cheese',                           '🧀', 350, 30),
    (cat_shared, 'Spicy Fries',                            'Baharatlı Patates Kızartması',           '🌶️', 160, 40),
    (cat_shared, 'Salt & Vinegar Fries',                   'Tuzlu Sirkeli Patates Kızartması',       '🍟', 170, 50),
    (cat_shared, 'Truffle Parmesan Fries',                 'Trüf Parmesanlı Patates Kızartması',     '🍄', 250, 60),
    (cat_shared, 'Cheddar Fries',                          'Cheddarlı Patates Kızartması',           '🧀', 260, 70),
    (cat_shared, 'Philly Cheese Steak Fries',              'Philly Cheese Steak Patates Kızartması', '🥖', 390, 80);

  -- ── EXTRA ──────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order)
  select c.id, t.name_en, t.name_tr, t.emoji, t.price, t.sort_order
  from (values
    ('extra', 'Burger Patty',    'Burger Köftesi', '🍔', 200, 10),
    ('extra', 'Füme Dana Sosis', 'Füme Dana Sosis','🌭', 250, 20),
    ('extra', 'Füme Et',         'Füme Et',        '🥩', 120, 30),
    ('extra', 'Crispy Chicken',  'Çıtır Tavuk',    '🍗', 170, 40),
    ('extra', 'Cheddar Slice',   'Cheddar Dilim',  '🧀',  30, 50),
    ('extra', 'Fried Egg',       'Göz Yumurta',    '🍳',  30, 60)
  ) as t(slug, name_en, name_tr, emoji, price, sort_order)
  join public.categories c on c.slug = t.slug;

  -- ── HOMEMADE SAUCES ────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order)
  select c.id, t.name_en, t.name_tr, t.emoji, t.price, t.sort_order
  from (values
    ('sauces', 'Cheddar Sauce',       'Cheddar Sos',      '🧀', 25, 10),
    ('sauces', 'Honey Mustard Sauce', 'Ballı Hardal Sos', '🍯', 25, 20),
    ('sauces', 'Ranch Sauce',         'Ranch Sos',        '🌿', 25, 30),
    ('sauces', 'White BBQ Sauce',     'Beyaz BBQ Sos',    '🤍', 25, 40),
    ('sauces', 'Sour Cream Sauce',    'Ekşi Krema Sos',   '🥛', 25, 50),
    ('sauces', 'Spicy Mayo Sauce',    'Acı Mayo Sos',     '🌶️', 25, 60)
  ) as t(slug, name_en, name_tr, emoji, price, sort_order)
  join public.categories c on c.slug = t.slug;

  -- ── FRENCH TOASTS ──────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_french_toast, 'Brioche Caramel',      'Brioche Caramel',      '🍮', 330, 10),
    (cat_french_toast, 'French Toast',         'French Toast',         '🍞', 350, 20),
    (cat_french_toast, 'Berries French Toast', 'Berries French Toast', '🍓', 350, 30);

  -- ── WAFFLES ────────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_waffles, 'Chicky Caramel Waffle',      'Chicky Caramel Waffle',      '🧇', 410, 10),
    (cat_waffles, 'Apple & Cinnamon Waffle',    'Apple & Cinnamon Waffle',    '🍎', 360, 20),
    (cat_waffles, 'Berries & Ice Cream Waffle', 'Berries & Ice Cream Waffle', '🍓', 360, 30),
    (cat_waffles, 'Nutella Waffle',             'Nutella Waffle',             '🍫', 360, 40),
    (cat_waffles, 'Nashville Waffle',           'Nashville Waffle',           '🌶️', 420, 50);

  -- ── PANCAKES ───────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_pancakes, 'Egg & Smoke Pancake', 'Egg & Smoke Pancake', '🥞', 410, 10),
    (cat_pancakes, 'Banana Pancake',      'Banana Pancake',      '🍌', 330, 20),
    (cat_pancakes, 'Nutella Pancake',     'Nutella Pancake',     '🍫', 350, 30);

  -- ── MOCKTAILS ──────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_mocktails, 'Kuzu Kulağı', 'Kuzu Kulağı', '🌸', 200, 10),
    (cat_mocktails, 'Sunset',      'Sunset',      '🌅', 200, 20),
    (cat_mocktails, 'Red Moon',    'Red Moon',    '🌕', 200, 30);

  -- ── MILKSHAKES ─────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_milkshakes, 'Peanut Butter Milkshake',  'Yer Fıstıklı Milkshake',   '🥜', 180, 10),
    (cat_milkshakes, 'Pink Milkshake',           'Cici Bebe Milkshake',      '🩷', 175, 20),
    (cat_milkshakes, 'Salted Caramel Milkshake', 'Tuzlu Karamelli Milkshake','🍮', 180, 30),
    (cat_milkshakes, 'Vanilla Milkshake',        'Vanilya Milkshake',        '🍦', 170, 40),
    (cat_milkshakes, 'Strawberry Milkshake',     'Çilekli Milkshake',        '🍓', 170, 50),
    (cat_milkshakes, 'Oreo Milkshake',           'Oreo Milkshake',           '🍪', 180, 60),
    (cat_milkshakes, 'Banana Milkshake',         'Muzlu Milkshake',          '🍌', 175, 70);

  -- ── HOT DRINKS ─────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_hot_drinks, 'Tea',               'Çay',             '🫖',  40, 10),
    (cat_hot_drinks, 'Turkish Coffee',    'Türk Kahvesi',    '☕', 130, 20),
    (cat_hot_drinks, 'Filter Coffee',     'Filtre Kahve',    '☕', 130, 30),
    (cat_hot_drinks, 'Double Espresso',   'Double Espresso', '☕', 130, 40),
    (cat_hot_drinks, 'Americano',         'Americano',       '☕', 130, 50),
    (cat_hot_drinks, 'Latte',             'Latte',           '🥛', 130, 60),
    (cat_hot_drinks, 'Caramel Latte',     'Caramel Latte',   '🍮', 130, 70),
    (cat_hot_drinks, 'Hot Chocolate',     'Sıcak Çikolata',  '🍫', 150, 80),
    (cat_hot_drinks, 'Salep',             'Salep',           '🌸', 150, 90);

  -- ── COLD DRINKS ────────────────────────────────────────────────────────────
  insert into public.menu_items (category_id, name_en, name_tr, emoji, price, sort_order) values
    (cat_cold_drinks, 'Iced Americano',         'İce Americano',              '🧊', 130, 10),
    (cat_cold_drinks, 'Iced Latte',             'İce Latte',                  '🧊', 130, 20),
    (cat_cold_drinks, 'Iced Caramel Latte',     'İce Caramel Latte',          '🧊', 130, 30),
    (cat_cold_drinks, 'Iced Filter Coffee',     'İce Filtre Kahve',           '🧊', 130, 40),
    (cat_cold_drinks, 'Pickle Juice',           'Turşu Suyu',                 '🥒', 120, 50),
    (cat_cold_drinks, 'Spicy Pickle Juice',     'Acı Turşu Suyu',             '🌶️', 120, 60),
    (cat_cold_drinks, 'Lemonade',              'Limonata',                   '🍋', 120, 70),
    (cat_cold_drinks, 'Spicy Lemonade',         'Acı Limonata',               '🌶️', 120, 80),
    (cat_cold_drinks, 'Özerhisar Ayran',        'Özerhisar Ayran',            '🥛',  90, 90),
    (cat_cold_drinks, 'Coca Cola',              'Coca Cola',                  '🥤',  80,100),
    (cat_cold_drinks, 'Coca Cola Zero Sugar',   'Coca Cola Zero Sugar',       '🥤',  80,110),
    (cat_cold_drinks, 'Sprite',                 'Sprite',                     '🥤',  80,120),
    (cat_cold_drinks, 'Fanta',                  'Fanta',                      '🥤',  80,130),
    (cat_cold_drinks, 'Fuse Tea (Peach/Lemon)', 'Fuse Tea (Şeftali / Limon)', '🍑',  80,140),
    (cat_cold_drinks, 'Soda',                   'Soda',                       '💧',  60,150),
    (cat_cold_drinks, 'Water',                  'Su',                         '💧',  40,160);

end $$;

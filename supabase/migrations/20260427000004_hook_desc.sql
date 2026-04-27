-- Rename existing desc_en/desc_tr to hook_en/hook_tr (short flavour words shown on card)
-- Add new desc_en/desc_tr for long descriptions shown in modal

alter table public.menu_items
  rename column desc_en to hook_en;

alter table public.menu_items
  rename column desc_tr to hook_tr;

alter table public.menu_items
  add column if not exists desc_en text not null default '',
  add column if not exists desc_tr text not null default '';

-- ── Seed hooks (short card labels) ─────────────────────────────────────────
update public.menu_items set hook_en = 'classic · hearty · full',        hook_tr = 'klasik · doyurucu · tam'         where name_en = 'Deck Plate';
update public.menu_items set hook_en = 'sweet · fluffy · indulgent',     hook_tr = 'tatlı · kabarık · şımartıcı'    where name_en = 'Sweety Deck Plate';
update public.menu_items set hook_en = 'fresh · light · vibrant',        hook_tr = 'taze · hafif · canlı'           where name_en = 'Fresh Deck Plate';

update public.menu_items set hook_en = 'smoky · rich · savory',          hook_tr = 'dumanlı · zengin · lezzetli'    where name_en = 'Crispy Burger';
update public.menu_items set hook_en = 'fiery · bold · smoky',           hook_tr = 'ateşli · güçlü · dumanlı'       where name_en = 'Red Dead Crispy Burger';
update public.menu_items set hook_en = 'hot · sticky · crispy',          hook_tr = 'acı · yapışkan · çıtır'         where name_en = 'Hot Wings';
update public.menu_items set hook_en = 'crispy · juicy · tender',        hook_tr = 'çıtır · sulu · yumuşak'         where name_en = 'Crisp Up Tenders';
update public.menu_items set hook_en = 'spicy · crispy · bold',          hook_tr = 'acılı · çıtır · cesur'          where name_en = 'Red Dead Tenders';
update public.menu_items set hook_en = 'zesty · crispy · aromatic',      hook_tr = 'ferahlatıcı · çıtır · aromatik' where name_en = 'Lemon Pepper Wings';

update public.menu_items set hook_en = 'clean · simple · classic',       hook_tr = 'sade · basit · klasik'          where name_en = 'Simple Burger';
update public.menu_items set hook_en = 'saucy · cheesy · stacked',       hook_tr = 'soslu · peynirli · katmanlı'    where name_en = 'Deck MAC Burger';
update public.menu_items set hook_en = 'spicy · smoky · bold',           hook_tr = 'acılı · dumanlı · cesur'        where name_en = 'Kansas Burger';
update public.menu_items set hook_en = 'earthy · rich · luxurious',      hook_tr = 'toprak · zengin · lüks'         where name_en = 'Truffle Burger';
update public.menu_items set hook_en = 'loaded · iconic · legendary',    hook_tr = 'dolu · ikonik · efsanevi'       where name_en = 'Upperdeck Burger';
update public.menu_items set hook_en = 'sweet · tangy · unique',         hook_tr = 'tatlı · ekşi · özgün'           where name_en = 'Berries Burger';
update public.menu_items set hook_en = 'thin · crispy · smashed',        hook_tr = 'ince · çıtır · ezilmiş'         where name_en = 'Simple Smash';
update public.menu_items set hook_en = 'caramelized · sweet · crispy',   hook_tr = 'karamelize · tatlı · çıtır'     where name_en = 'Oklahoma Onion';
update public.menu_items set hook_en = 'runny · rich · indulgent',       hook_tr = 'akışkan · zengin · şımartıcı'   where name_en = 'Wild Eggy';
update public.menu_items set hook_en = 'double · crispy · smashed',      hook_tr = 'çift · çıtır · ezilmiş'         where name_en = 'Deck Smash';

update public.menu_items set hook_en = 'smoky · tangy · saucy',          hook_tr = 'dumanlı · ekşi · soslu'         where name_en = 'BBQ Dog';
update public.menu_items set hook_en = 'cheesy · savory · stacked',      hook_tr = 'peynirli · lezzetli · dolu'     where name_en = 'Philly Cheese Steak Bun';

update public.menu_items set hook_en = 'plant · wholesome · satisfying', hook_tr = 'bitkisel · besleyici · doyurucu' where name_en = 'Veggy Bun';
update public.menu_items set hook_en = 'fresh · crisp · light',          hook_tr = 'taze · gevrek · hafif'          where name_en = 'Deck Salata';

update public.menu_items set hook_en = 'crunchy · golden · addictive',   hook_tr = 'gevrek · altın · bağımlılık yapan' where name_en = 'Crisp Up Onions';
update public.menu_items set hook_en = 'golden · crispy · classic',      hook_tr = 'altın · çıtır · klasik'         where name_en = 'French Fries';
update public.menu_items set hook_en = 'creamy · cheesy · comfort',      hook_tr = 'kremali · peynirli · rahatlatıcı' where name_en = 'Mac & Cheese';
update public.menu_items set hook_en = 'spiced · crispy · bold',         hook_tr = 'baharatlı · çıtır · cesur'      where name_en = 'Spicy Fries';
update public.menu_items set hook_en = 'tangy · crispy · sharp',         hook_tr = 'ekşi · çıtır · keskin'          where name_en = 'Salt & Vinegar Fries';
update public.menu_items set hook_en = 'earthy · crispy · elegant',      hook_tr = 'toprak · çıtır · zarif'         where name_en = 'Truffle Parmesan Fries';
update public.menu_items set hook_en = 'cheesy · gooey · crispy',        hook_tr = 'peynirli · yapışkan · çıtır'    where name_en = 'Cheddar Fries';
update public.menu_items set hook_en = 'loaded · savory · indulgent',    hook_tr = 'dolu · lezzetli · şımartıcı'    where name_en = 'Philly Cheese Steak Fries';

update public.menu_items set hook_en = 'caramelized · soft · sweet',     hook_tr = 'karamelize · yumuşak · tatlı'   where name_en = 'Brioche Caramel';
update public.menu_items set hook_en = 'eggy · golden · classic',        hook_tr = 'yumurtalı · altın · klasik'     where name_en = 'French Toast';
update public.menu_items set hook_en = 'fruity · sweet · vibrant',       hook_tr = 'meyveli · tatlı · canlı'        where name_en = 'Berries French Toast';

update public.menu_items set hook_en = 'sweet · crispy · caramel',       hook_tr = 'tatlı · çıtır · karamel'        where name_en = 'Chicky Caramel Waffle';
update public.menu_items set hook_en = 'warm · spiced · cozy',           hook_tr = 'sıcak · baharatlı · samimi'     where name_en = 'Apple & Cinnamon Waffle';
update public.menu_items set hook_en = 'fruity · creamy · dreamy',       hook_tr = 'meyveli · kremali · hayali'     where name_en = 'Berries & Ice Cream Waffle';
update public.menu_items set hook_en = 'chocolatey · rich · sweet',      hook_tr = 'çikolatalı · zengin · tatlı'    where name_en = 'Nutella Waffle';
update public.menu_items set hook_en = 'spicy · crispy · sweet',         hook_tr = 'acılı · çıtır · tatlı'          where name_en = 'Nashville Waffle';

update public.menu_items set hook_en = 'savory · fluffy · smoky',        hook_tr = 'lezzetli · kabarık · dumanlı'   where name_en = 'Egg & Smoke Pancake';
update public.menu_items set hook_en = 'sweet · soft · tropical',        hook_tr = 'tatlı · yumuşak · tropikal'     where name_en = 'Banana Pancake';
update public.menu_items set hook_en = 'chocolatey · fluffy · sweet',    hook_tr = 'çikolatalı · kabarık · tatlı'   where name_en = 'Nutella Pancake';

update public.menu_items set hook_en = 'fruity · tangy · refreshing',    hook_tr = 'meyveli · ekşi · ferahlatıcı'   where name_en = 'Kuzu Kulağı';
update public.menu_items set hook_en = 'tropical · sweet · vibrant',     hook_tr = 'tropikal · tatlı · canlı'       where name_en = 'Sunset';
update public.menu_items set hook_en = 'bold · fruity · striking',       hook_tr = 'cesur · meyveli · çarpıcı'      where name_en = 'Red Moon';

update public.menu_items set hook_en = 'nutty · creamy · rich',          hook_tr = 'fıstıklı · kremali · zengin'    where name_en = 'Peanut Butter Milkshake';
update public.menu_items set hook_en = 'sweet · pink · playful',         hook_tr = 'tatlı · pembe · eğlenceli'      where name_en = 'Pink Milkshake';
update public.menu_items set hook_en = 'sweet · salty · velvety',        hook_tr = 'tatlı · tuzlu · kadifemsi'      where name_en = 'Salted Caramel Milkshake';
update public.menu_items set hook_en = 'classic · smooth · dreamy',      hook_tr = 'klasik · akıcı · hayali'        where name_en = 'Vanilla Milkshake';
update public.menu_items set hook_en = 'fruity · sweet · pink',          hook_tr = 'meyveli · tatlı · pembe'        where name_en = 'Strawberry Milkshake';
update public.menu_items set hook_en = 'crunchy · creamy · sweet',       hook_tr = 'gevrek · kremali · tatlı'       where name_en = 'Oreo Milkshake';
update public.menu_items set hook_en = 'tropical · smooth · sweet',      hook_tr = 'tropikal · akıcı · tatlı'       where name_en = 'Banana Milkshake';

update public.menu_items set hook_en = 'warm · aromatic · classic',      hook_tr = 'sıcak · aromatik · klasik'      where name_en = 'Turkish Coffee';
update public.menu_items set hook_en = 'smooth · rich · mellow',         hook_tr = 'akıcı · zengin · yumuşak'       where name_en = 'Filter Coffee';
update public.menu_items set hook_en = 'strong · bold · pure',           hook_tr = 'güçlü · cesur · saf'            where name_en = 'Double Espresso';
update public.menu_items set hook_en = 'smooth · clean · classic',       hook_tr = 'akıcı · temiz · klasik'         where name_en = 'Americano';
update public.menu_items set hook_en = 'creamy · smooth · milky',        hook_tr = 'kremali · akıcı · sütlü'        where name_en = 'Latte';
update public.menu_items set hook_en = 'sweet · creamy · indulgent',     hook_tr = 'tatlı · kremali · şımartıcı'    where name_en = 'Caramel Latte';
update public.menu_items set hook_en = 'rich · velvety · cozy',          hook_tr = 'zengin · kadifemsi · samimi'    where name_en = 'Hot Chocolate';
update public.menu_items set hook_en = 'warm · spiced · aromatic',       hook_tr = 'sıcak · baharatlı · aromatik'   where name_en = 'Salep';

update public.menu_items set hook_en = 'bold · iced · refreshing',       hook_tr = 'cesur · buzlu · ferahlatıcı'    where name_en = 'Iced Americano';
update public.menu_items set hook_en = 'creamy · iced · smooth',         hook_tr = 'kremali · buzlu · akıcı'        where name_en = 'Iced Latte';
update public.menu_items set hook_en = 'sweet · iced · indulgent',       hook_tr = 'tatlı · buzlu · şımartıcı'      where name_en = 'Iced Caramel Latte';
update public.menu_items set hook_en = 'smooth · iced · mellow',         hook_tr = 'akıcı · buzlu · yumuşak'        where name_en = 'Iced Filter Coffee';
update public.menu_items set hook_en = 'tangy · sour · briny',           hook_tr = 'ekşi · keskin · salamuralı'     where name_en = 'Pickle Juice';
update public.menu_items set hook_en = 'spicy · sour · bold',            hook_tr = 'acılı · ekşi · cesur'           where name_en = 'Spicy Pickle Juice';
update public.menu_items set hook_en = 'zesty · bright · fresh',         hook_tr = 'ferahlatıcı · parlak · taze'    where name_en = 'Lemonade';
update public.menu_items set hook_en = 'spicy · zesty · bold',           hook_tr = 'acılı · ferahlatıcı · cesur'    where name_en = 'Spicy Lemonade';

-- ── Seed descriptions (long modal text) ────────────────────────────────────
update public.menu_items set
  desc_en = 'A full breakfast spread with eggs, smoked meats, fresh vegetables, cheese, olives, and warm bread. Everything you need to start the day right.',
  desc_tr = 'Yumurta, füme et, taze sebze, peynir, zeytin ve sıcak ekmekle dolu bir kahvaltı tabağı. Güne güzel başlamak için ihtiyacınız olan her şey.'
  where name_en = 'Deck Plate';

update public.menu_items set
  desc_en = 'A sweeter take on our classic breakfast plate — featuring honey, jams, fresh fruit, pancakes, and all the good stuff.',
  desc_tr = 'Klasik kahvaltı tabağımızın daha tatlı versiyonu — bal, reçel, taze meyve, pankek ve daha fazlasıyla.'
  where name_en = 'Sweety Deck Plate';

update public.menu_items set
  desc_en = 'A lighter, fresher breakfast plate loaded with seasonal vegetables, herbs, and light cheeses. Perfect for a clean start.',
  desc_tr = 'Mevsim sebzeleri, otlar ve hafif peynirlerle dolu, daha taze ve hafif bir kahvaltı tabağı.'
  where name_en = 'Fresh Deck Plate';

update public.menu_items set
  desc_en = 'Golden crispy fried chicken breast in a soft brioche bun, topped with pickles, lettuce, and our signature sauce.',
  desc_tr = 'Yumuşak brioche ekmeğinde altın çıtır tavuk göğsü, turşu, marul ve özel sosumuzla.'
  where name_en = 'Crispy Burger';

update public.menu_items set
  desc_en = 'Our Crispy Burger turned up to eleven. Drenched in our blazing Red Dead hot sauce — not for the faint-hearted.',
  desc_tr = 'Crispy Burger''ın ateşli versiyonu. Yakıcı Red Dead sosumuzla kaplanmış — cesaretiniz varsa deneyin.'
  where name_en = 'Red Dead Crispy Burger';

update public.menu_items set
  desc_en = 'Juicy chicken wings tossed in our house hot sauce. Finger-licking, lip-burning, can''t-stop-eating good.',
  desc_tr = 'Ev yapımı acı sosumuzla buluşan sulu tavuk kanatları. Parmaklarınızı yalatacak kadar lezzetli.'
  where name_en = 'Hot Wings';

update public.menu_items set
  desc_en = 'Hand-breaded chicken tenders fried to a perfect golden crisp. Great on their own or dipped in any of our homemade sauces.',
  desc_tr = 'Elle unlanan tavuk parçaları mükemmel bir altın çıtırlığa kadar kızartıldı. Ev yapımı soslarımızla mükemmel uyum.'
  where name_en = 'Crisp Up Tenders';

update public.menu_items set
  desc_en = 'Crispy tenders soaked in our fiery Red Dead sauce. Bold heat with every bite.',
  desc_tr = 'Ateşli Red Dead sosumuzla yoğrulan çıtır tavuk parçaları. Her lokmada cesur bir acı.'
  where name_en = 'Red Dead Tenders';

update public.menu_items set
  desc_en = 'Crispy wings tossed generously in fresh lemon juice and cracked black pepper. Bright, aromatic, and seriously addictive.',
  desc_tr = 'Taze limon suyu ve kırık karabiberle harmanlanan çıtır kanatlar. Ferahlatıcı, aromatik ve bağımlılık yapan.'
  where name_en = 'Lemon Pepper Wings';

update public.menu_items set
  desc_en = 'A no-frills smash burger with a perfectly seared beef patty, American cheese, pickles, onions, mustard, and ketchup.',
  desc_tr = 'Mükemmel kızartılmış dana köftesi, Amerikan peyniri, turşu, soğan, hardal ve ketçapla sade ama lezzetli bir smash burger.'
  where name_en = 'Simple Burger';

update public.menu_items set
  desc_en = 'Our take on the Big Mac — double patties, special Deck sauce, shredded lettuce, cheese, pickles, and onions.',
  desc_tr = 'Big Mac''ten ilhamımızı aldığımız burger — çift köfte, özel Deck sosu, marul, peynir, turşu ve soğan.'
  where name_en = 'Deck MAC Burger';

update public.menu_items set
  desc_en = 'A smoky, spicy Kansas-style burger with jalapeños, pepper jack cheese, and our bold BBQ sauce.',
  desc_tr = 'Jalapeño, acılı peynir ve cesur BBQ sosumuzla Kansas usulü dumanlı ve acılı bir burger.'
  where name_en = 'Kansas Burger';

update public.menu_items set
  desc_en = 'Beef patty topped with creamy truffle aioli, parmesan shavings, arugula, and caramelized onions. Elevated comfort food.',
  desc_tr = 'Trüf aioli, parmesan, roka ve karamelize soğanla süslenen dana köftesi. Lüks konfor yemeği.'
  where name_en = 'Truffle Burger';

update public.menu_items set
  desc_en = 'Our signature stacked burger — two smashed patties, aged cheddar, bacon, caramelized onions, and the Deck special sauce.',
  desc_tr = 'İmza burgerimiz — iki ezilmiş köfte, olgunlaştırılmış cheddar, pastırma, karamelize soğan ve özel Deck sosu.'
  where name_en = 'Upperdeck Burger';

update public.menu_items set
  desc_en = 'A unique sweet-savory burger topped with mixed berry compote, brie cheese, and arugula. Unexpected and unforgettable.',
  desc_tr = 'Karışık meyve kompostosu, brie peyniri ve rokayla süslenen tatlı-tuzlu bir burger. Beklenmedik ve unutulmaz.'
  where name_en = 'Berries Burger';

update public.menu_items set
  desc_en = 'A classic smash burger — thin crispy edges, juicy center, melted cheese, and simple toppings. Done right.',
  desc_tr = 'İnce çıtır kenarlı, sulu ortası ve erimiş peyniriyle klasik bir smash burger. Doğru yapılmış.'
  where name_en = 'Simple Smash';

update public.menu_items set
  desc_en = 'A smash patty buried under a mountain of crispy caramelized onions, melted cheese, and pickles. Messy and magnificent.',
  desc_tr = 'Dağ gibi çıtır karamelize soğan, erimiş peynir ve turşuyla kaplı smash köftesi. Dağınık ve muhteşem.'
  where name_en = 'Oklahoma Onion';

update public.menu_items set
  desc_en = 'Smashed beef patty topped with a perfectly fried egg, bacon, cheddar, and aioli. Rich, runny, and completely satisfying.',
  desc_tr = 'Mükemmel kızartılmış yumurta, pastırma, cheddar ve aioliyle süslenen ezilmiş dana köftesi.'
  where name_en = 'Wild Eggy';

update public.menu_items set
  desc_en = 'Double smashed patties with double cheddar, pickles, onions, and a generous hit of our Deck sauce.',
  desc_tr = 'Çift ezilmiş köfte, çift cheddar, turşu, soğan ve bol miktarda Deck sosu.'
  where name_en = 'Deck Smash';

update public.menu_items set
  desc_en = 'A toasted bun loaded with a smoky beef frank, crispy onions, tangy BBQ sauce, mustard, and pickles.',
  desc_tr = 'Dumanlı dana sosis, çıtır soğan, ekşili BBQ sosu, hardal ve turşuyla dolu kızarmış ekmek.'
  where name_en = 'BBQ Dog';

update public.menu_items set
  desc_en = 'Thinly sliced ribeye, sautéed peppers and onions, and provolone cheese piled high in a toasted hoagie bun.',
  desc_tr = 'İnce dilimlenmiş bonfile, sotelenmiş biber ve soğan ile provolone peyniriyle dolu kızarmış ekmek.'
  where name_en = 'Philly Cheese Steak Bun';

update public.menu_items set
  desc_en = 'A hearty plant-based patty with roasted vegetables, avocado, lettuce, tomato, and our herb aioli.',
  desc_tr = 'Kavrulmuş sebzeler, avokado, marul, domates ve otlu aiolimizle dolu doyurucu bitkisel köfte.'
  where name_en = 'Veggy Bun';

update public.menu_items set
  desc_en = 'A fresh house salad with seasonal greens, cherry tomatoes, cucumbers, and our light lemon vinaigrette.',
  desc_tr = 'Mevsim yeşillikleri, kiraz domates, salatalık ve hafif limon sosuyla taze ev salatası.'
  where name_en = 'Deck Salata';

update public.menu_items set
  desc_en = 'Thick-cut onion rings in a light, crispy batter. Golden outside, sweet and tender inside. Great for sharing.',
  desc_tr = 'Hafif çıtır kaplama içinde kalın dilimlenmiş soğan halkaları. Dışı altın, içi tatlı ve yumuşak.'
  where name_en = 'Crisp Up Onions';

update public.menu_items set
  desc_en = 'Hand-cut fries fried twice for maximum crispiness. Simple, golden, perfect.',
  desc_tr = 'Maksimum çıtırlık için iki kez kızartılan elle kesilmiş patatesler. Sade, altın ve mükemmel.'
  where name_en = 'French Fries';

update public.menu_items set
  desc_en = 'Elbow pasta in a rich, creamy four-cheese sauce. The ultimate comfort side.',
  desc_tr = 'Zengin, kremali dört peynir sosuyla dirsek makarna. En iyi konfor yan yemeği.'
  where name_en = 'Mac & Cheese';

update public.menu_items set
  desc_en = 'Crispy fries dusted with our house spice blend — paprika, garlic, cumin, and a touch of heat.',
  desc_tr = 'Ev baharatlı karışımımızla — paprika, sarımsak, kimyon ve hafif acıyla — kaplanan çıtır patatesler.'
  where name_en = 'Spicy Fries';

update public.menu_items set
  desc_en = 'Classic crispy fries tossed with malt vinegar and sea salt. Sharp, tangy, and incredibly moreish.',
  desc_tr = 'Malt sirkesi ve deniz tuzuyla harmanlanan klasik çıtır patatesler. Keskin, ekşi ve inanılmaz lezzetli.'
  where name_en = 'Salt & Vinegar Fries';

update public.menu_items set
  desc_en = 'Golden fries drizzled with truffle oil and topped with grated parmesan and fresh herbs. Indulgent and elegant.',
  desc_tr = 'Trüf yağı gezdirilmiş, rendelenmiş parmesan ve taze otlarla süslenmiş altın patatesler.'
  where name_en = 'Truffle Parmesan Fries';

update public.menu_items set
  desc_en = 'Crispy fries smothered in warm, melted cheddar sauce. Gooey, cheesy, and absolutely satisfying.',
  desc_tr = 'Sıcak, erimiş cheddar sosuyla kaplanan çıtır patatesler. Yapışkan, peynirli ve tatmin edici.'
  where name_en = 'Cheddar Fries';

update public.menu_items set
  desc_en = 'Crispy fries loaded with shaved ribeye, sautéed peppers, onions, and provolone cheese sauce. A full meal in a basket.',
  desc_tr = 'İnce dilimlenmiş bonfile, sotelenmiş biber, soğan ve provolone peynir sosuyla dolu çıtır patatesler.'
  where name_en = 'Philly Cheese Steak Fries';

update public.menu_items set
  desc_en = 'Thick brioche French toast soaked in a vanilla custard, pan-fried golden, and drizzled with house caramel sauce.',
  desc_tr = 'Vanilyalı muhallebiye batırılmış kalın brioche French toast, altın rengi kızartılmış ve ev yapımı karamel sosuyla.'
  where name_en = 'Brioche Caramel';

update public.menu_items set
  desc_en = 'Classic eggy brioche slices pan-fried to golden perfection. Served with maple syrup and powdered sugar.',
  desc_tr = 'Altın mükemmelliğinde kızartılmış klasik yumurtalı brioche dilimleri. Akçaağaç şurubu ve pudra şekeriyle servis edilir.'
  where name_en = 'French Toast';

update public.menu_items set
  desc_en = 'Golden French toast topped with fresh mixed berries, whipped cream, and a drizzle of berry coulis.',
  desc_tr = 'Taze karışık meyveler, çırpılmış krema ve meyve sosuyla süslenen altın French toast.'
  where name_en = 'Berries French Toast';

update public.menu_items set
  desc_en = 'Fluffy Belgian waffle topped with a crispy chicken tender, drizzled in caramel sauce and a dusting of sea salt.',
  desc_tr = 'Çıtır tavuk parçası, karamel sosu ve deniz tuzu serpiştirmesiyle süslenen kabarık Belçika wafflesi.'
  where name_en = 'Chicky Caramel Waffle';

update public.menu_items set
  desc_en = 'Warm waffle topped with spiced stewed apples, cinnamon cream, and a sprinkle of brown sugar.',
  desc_tr = 'Baharatlı pişmiş elma, tarçınlı krema ve esmer şekerle süslenen sıcak waffle.'
  where name_en = 'Apple & Cinnamon Waffle';

update public.menu_items set
  desc_en = 'Crispy waffle topped with fresh seasonal berries, vanilla ice cream, and a drizzle of berry sauce.',
  desc_tr = 'Taze mevsim meyveleri, vanilyalı dondurma ve meyve sosuyla süslenen çıtır waffle.'
  where name_en = 'Berries & Ice Cream Waffle';

update public.menu_items set
  desc_en = 'Golden waffle generously spread with Nutella and topped with crushed hazelnuts and a dusting of powdered sugar.',
  desc_tr = 'Nutella ile kaplanan, kırık fındık ve pudra şekeriyle süslenen altın waffle.'
  where name_en = 'Nutella Waffle';

update public.menu_items set
  desc_en = 'A spicy-sweet Nashville-inspired waffle topped with a hot honey glaze, crispy chicken, and pickle slices.',
  desc_tr = 'Acı bal sosu, çıtır tavuk ve turşu dilimleriyle süslenen Nashville ilhamlı tatlı-acı waffle.'
  where name_en = 'Nashville Waffle';

update public.menu_items set
  desc_en = 'Fluffy pancakes stacked with scrambled eggs and sliced smoked meat. A hearty savory breakfast stack.',
  desc_tr = 'Çırpılmış yumurta ve dilimlenmiş füme etle süslenen kabarık pankekler. Doyurucu tuzlu bir kahvaltı.'
  where name_en = 'Egg & Smoke Pancake';

update public.menu_items set
  desc_en = 'Soft fluffy pancakes layered with fresh banana slices, caramel drizzle, and whipped cream.',
  desc_tr = 'Taze muz dilimleri, karamel sosu ve çırpılmış kremayla katmanlı yumuşak kabarık pankekler.'
  where name_en = 'Banana Pancake';

update public.menu_items set
  desc_en = 'Thick fluffy pancakes generously topped with Nutella, crushed hazelnuts, and a dusting of icing sugar.',
  desc_tr = 'Nutella, kırık fındık ve pudra şekeriyle cömertçe süslenen kalın kabarık pankekler.'
  where name_en = 'Nutella Pancake';

update public.menu_items set
  desc_en = 'A refreshing mocktail made with fresh sorrel, citrus, and a hint of ginger. Tart, floral, and reviving.',
  desc_tr = 'Taze kuzukulağı, narenciye ve zencefil dokunuşuyla yapılan ferahlatıcı mocktail.'
  where name_en = 'Kuzu Kulağı';

update public.menu_items set
  desc_en = 'A vibrant tropical mocktail with mango, passion fruit, and orange. Sunshine in a glass.',
  desc_tr = 'Mango, çarkıfelek meyvesi ve portakalla yapılan canlı tropikal mocktail. Bardakta güneş.'
  where name_en = 'Sunset';

update public.menu_items set
  desc_en = 'A striking deep-red mocktail made with pomegranate, berry, and a dash of lime. Bold and beautiful.',
  desc_tr = 'Nar, meyve ve limon dokunuşuyla yapılan çarpıcı koyu kırmızı mocktail. Cesur ve güzel.'
  where name_en = 'Red Moon';

update public.menu_items set
  desc_en = 'Thick creamy milkshake blended with real peanut butter and vanilla ice cream. Rich, nutty, and satisfying.',
  desc_tr = 'Gerçek fıstık ezmesi ve vanilyalı dondurmayla harmanlanmış kalın kremali milkshake.'
  where name_en = 'Peanut Butter Milkshake';

update public.menu_items set
  desc_en = 'A pastel pink milkshake made with strawberry, raspberry, and a hint of rose. Sweet, fun, and pretty.',
  desc_tr = 'Çilek, ahududu ve gül dokunuşuyla yapılan pastel pembe milkshake. Tatlı, eğlenceli ve güzel.'
  where name_en = 'Pink Milkshake';

update public.menu_items set
  desc_en = 'Velvety milkshake blended with house salted caramel sauce and vanilla ice cream. Sweet, salty, and irresistible.',
  desc_tr = 'Ev yapımı tuzlu karamel sosu ve vanilyalı dondurmayla harmanlanmış kadifemsi milkshake.'
  where name_en = 'Salted Caramel Milkshake';

update public.menu_items set
  desc_en = 'A timeless classic — pure vanilla bean ice cream blended to a smooth, dreamy shake.',
  desc_tr = 'Zamansız bir klasik — saf vanilya çekirdeği dondurması pürüzsüz, hayali bir shakeye dönüştürüldü.'
  where name_en = 'Vanilla Milkshake';

update public.menu_items set
  desc_en = 'Blended with fresh strawberries and vanilla ice cream. Fruity, creamy, and refreshingly sweet.',
  desc_tr = 'Taze çilek ve vanilyalı dondurmayla harmanlandı. Meyveli, kremali ve ferahlatıcı derecede tatlı.'
  where name_en = 'Strawberry Milkshake';

update public.menu_items set
  desc_en = 'Oreo cookies blended into a thick creamy vanilla base. Crunchy bits throughout — cookies and cream perfection.',
  desc_tr = 'Kalın kremali vanilya tabanına harmanlanmış Oreo kurabiyeler. Her yerde çıtır parçacıklar.'
  where name_en = 'Oreo Milkshake';

update public.menu_items set
  desc_en = 'Fresh bananas blended with vanilla ice cream into a smooth, tropical shake. Simple and absolutely delicious.',
  desc_tr = 'Taze muzlar vanilyalı dondurmayla pürüzsüz, tropikal bir shakeye dönüştürüldü.'
  where name_en = 'Banana Milkshake';

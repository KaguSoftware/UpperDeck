import type { Messages } from "./en";

const tr: Messages = {
    brand: {
        name: { main: "UPPER", accent: "DECK" },
        sub: "Amerikan Diner",
    },
    hero: {
        headline1: "Burgerler,",
        headline2: "waffle",
        headline3: "ve her neyse",
        headline4: "işte.",
        openHours: "Açık · 09:00 — 23:30",
        items: "ürün",
    },
    topbar: {
        order: "Sipariş",
    },
    filter: {
        all: "Tümü",
    },
    stage: {
        item: "ürün",
        items: "ürün",
    },
    modal: {
        spicy: "Acılı",
        price: "Fiyat",
        addToOrder: "Siparişe Ekle",
        specialInstructions: "Özel İstek",
        specialInstructionsPlaceholder: "örn. soğansız, bol sos…",
        alsoTry: "Bunları da dene",
        required: "Zorunlu",
        requiredMissing: "Zorunlu",
    },
    cart: {
        title: "Siparişiniz",
        table_number: "Masa numarası",
        table_from_qr: "QR'dan",
        note_placeholder: "Özel istekler, alerjiler…",
        callWaiter: "Garson Çağır",
        continueBrowsing: "Menüye dön",
        sending: "Gönderiliyor…",
        headed: "Garson siparişinizi almak için yola çıktı!",
        waiterCalled: "Garson çağrıldı — yolda!",
        error_send: "Personele ulaşılamadı. Lütfen tekrar deneyin.",
        subtotal: "Ara Toplam",
        error_validation:
            "Siparişinizde bir sorun var. Lütfen kontrol edip tekrar deneyin.",
        error_no_table:
            "Siparişinizi vermek için masa QR kodunu okutun veya masa numarası girin.",
    },
    toast: {
        empty: "Siparişin boş",
        itemsOnDeckOne: "{count} ürün sepette",
        itemsOnDeckMany: "{count} ürün sepette",
        addedPrefix: "Eklendi · ",
        orderSentPrefix: "Sipariş alındı! Masa ",
    },
    coupon: {
        label: "İndirim Kodu",
        placeholder: "KOD GİR",
        apply: "Uygula",
        noOfferTitle: "Geçerli teklif bulunamadı",
        noOfferBody:
            "Bültenimize abone olun, özel fırsatlardan ilk siz haberdar olun.",
        emailPlaceholder: "eposta@adresiniz.com",
        subscribe: "Abone Ol",
        subscribed: "Harika! Sizi haberdar edeceğiz.",
        noCouponPrefix: "Kupon yok mu? Bültenimize abone olun",
        noCouponLink: "buradan",
    },
    ticker: [
        "Smash Burger",
        "El Yapımı Kanatlar",
        "Çıtır Tenderlar",
        "Gerçek Milkshakeler",
        "Taze Limonata",
        "Trüflü Patates",
        "Tatlı · Tuzlu · Dumanlı",
        "Geç Saate Kadar Açık",
        "Paket Servis",
    ],
    waiter: {
        title: "Garson Çağır",
        bill: "Hesap",
        call: "Garson Çağır",
        cancel: "İptal",
        notified: "Garson çağrıldı",
        failed: "Personele ulaşılamadı — lütfen birini çağırın.",
    },
    qrRequired: {
        title: "Lütfen QR kodu okutun",
        body: "Sipariş vermek veya garson çağırmak için masanızdaki QR kodu okutun.",
    },
    bellTutorial: {
        eyebrow: "Bir şey ister misiniz?",
        title: "Çana dokun — hemen geliriz.",
        dismissHint: "devam etmek için dokun",
    },
    offline: {
        banner: "Çevrimdışısınız — bağlantı dönene kadar işlemler kaydedilmez",
    },
    categories: {
        Breakfast: "Kahvaltı",
        Chicken: "Tavuk",
        Burger: "Burger",
        "Dog-Bun": "Hot Dog",
        Veggy: "Vejetaryen",
        Shared: "Paylaşımlı",
        "French Toast": "Fransız Tostu",
        Waffles: "Waffle",
        Pancakes: "Krep",
        Mocktails: "Mokteyl",
        Milkshakes: "Milkshake",
        "Hot Drinks": "Sıcak İçecekler",
        "Cold Drinks": "Soğuk İçecekler",
    },
};

export default tr;

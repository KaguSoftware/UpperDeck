"use client";

import { Field, PrimaryButton } from "../../_components";
import { upsertSalesEntry, importSalesExcel } from "./actions";

const today = new Date().toISOString().slice(0, 10);

export function SalesForms() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Manual daily entry */}
      <section className="border-2 border-green bg-white p-5">
        <h2 className="font-bowlby text-[18px] text-green uppercase mb-1">Manuel Giriş</h2>
        <p className="text-[11px] text-green/70 mb-4">Bir günün gerçek satışını elle girin.</p>
        <form action={upsertSalesEntry} className="flex flex-col gap-4">
          <Field label="Tarih" name="entry_date" type="date" defaultValue={today} required />
          <Field label="Toplam Satış (₺)" name="total_sales" type="number" step="0.01" min="0" required />
          <Field label="Kişi Sayısı" name="covers" type="number" min="0" placeholder="opsiyonel" />
          <div>
            <PrimaryButton>Kaydet</PrimaryButton>
          </div>
        </form>
      </section>

      {/* Excel import */}
      <section className="border-2 border-green bg-white p-5">
        <h2 className="font-bowlby text-[18px] text-green uppercase mb-1">Excel İçe Aktar</h2>
        <p className="text-[11px] text-green/70 mb-4">
          <b>Gelir Merkezi Detaylar</b> raporunu (ürün/gün detaylı) doğrudan yükleyin — tarihler ve
          ürünler otomatik okunur. Ya da basit şablonu kullanın.{" "}
          <a href="/sales-template.csv" download className="text-orange font-extrabold underline">
            Şablonu indir
          </a>
        </p>
        <form action={importSalesExcel} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Dosya (.xlsx / .csv)<span className="text-orange ml-1">*</span>
            </span>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls,.csv"
              required
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[13px] text-ink file:mr-3 file:border-0 file:bg-green file:text-white file:px-3 file:py-1.5 file:font-extrabold file:text-[10px] file:uppercase file:tracking-[0.18em] file:cursor-pointer"
            />
          </label>
          <p className="text-[10px] text-green/60 leading-relaxed">
            <b>POS raporu:</b> "Gelir Merkezi Detaylar" sayfası otomatik algılanır — hazırlık gerekmez.
            <br />
            <b className="text-orange">Not:</b> "Genel Satış Raporu" (aylık özet) çalışmaz — günlük/ürün
            detayı içermez.
            <br />
            <b>Basit şablon:</b> sütunlar <b>date</b>, <b>total_sales</b>, <b>covers</b> (opsiyonel); isteğe
            bağlı <b>Items</b> sayfası: date, item_name, qty, revenue.
          </p>
          <div>
            <PrimaryButton>İçe Aktar</PrimaryButton>
          </div>
        </form>
      </section>
    </div>
  );
}

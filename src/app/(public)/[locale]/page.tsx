import { PhoneMenu } from "@/components/PhoneMenu/components";
import { getMessages } from "@/i18n";
import { locales, defaultLocale } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { getPublicMenu, getHeroSettings } from "@/lib/menu/queries";
import { getWaiterDisabledTables } from "@/lib/settings/queries";
import { cookies } from "next/headers";
import { verifyTableCookie } from "@/lib/table-auth";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  const lang: Locale = locales.includes(locale as Locale) ? (locale as Locale) : defaultLocale;

  const [messages, { categories, items }, heroSettings, disabledTables] = await Promise.all([
    Promise.resolve(getMessages(lang)),
    getPublicMenu(lang),
    getHeroSettings(),
    getWaiterDisabledTables(),
  ]);

  const rawT = typeof sp.t === "string" ? parseInt(sp.t, 10) : NaN;
  const urlTable = Number.isInteger(rawT) && rawT >= 1 && rawT <= 999 ? rawT : undefined;

  const cookieStore = await cookies();
  const rawCookie = cookieStore.get("table_session")?.value;
  const cookieTable = rawCookie ? verifyTableCookie(rawCookie) : null;

  // Cookie wins (verified via /scan); URL param is fallback for dev/staff
  const initialTableNumber = cookieTable ?? urlTable;

  const openHoursOverride =
    (lang === "tr" ? heroSettings.openHoursTr : heroSettings.openHoursEn) || null;

  return (
    <PhoneMenu
      messages={messages}
      locale={lang}
      categories={categories}
      items={items}
      initialTableNumber={initialTableNumber}
      disabledTables={disabledTables}
      heroMode={heroSettings.heroMode}
      heroMediaUrl={heroSettings.heroMediaUrl}
      featuredItem={heroSettings.featuredItem}
      featuredItemId={heroSettings.featuredItemId}
      featuredLabel={heroSettings.featuredLabel}
      featuredBadge={heroSettings.featuredBadge}
      featuredDiscount={heroSettings.featuredDiscount}
      openHoursOverride={openHoursOverride}
    />
  );
}

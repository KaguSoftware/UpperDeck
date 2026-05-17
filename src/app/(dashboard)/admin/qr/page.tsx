import QRCode from "qrcode";
import Image from "next/image";
import { generateToken } from "@/lib/table-auth";
import { env } from "@/lib/env";
import { getWaiterDisabledTables } from "@/lib/settings/queries";
import { PageHeader } from "../_components";
import { PrintButton } from "./_print-button";
import { TableWaiterToggle } from "./_table-toggles";

const TABLE_COUNT = parseInt(process.env.TABLE_COUNT ?? "20", 10);

export default async function QRPage() {
    const baseUrl = env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    const disabledTables = await getWaiterDisabledTables();

    const tables = await Promise.all(
        Array.from({ length: TABLE_COUNT }, (_, i) => i + 1).map(async (n) => {
            const { tok, w } = generateToken(n);
            const url = `${baseUrl}/tr/scan?t=${n}&w=${w}&tok=${tok}`;
            const dataUrl = await QRCode.toDataURL(url, {
                width: 360,
                margin: 2,
                errorCorrectionLevel: "H",
            });
            return { n, url, dataUrl };
        })
    );

    return (
        <>
            <style>{`
        @media print {
          nav, aside, header, [data-sidebar], [data-no-print] { display: none !important; }
          body { background: white !important; }
          .qr-grid { grid-template-columns: repeat(4, 1fr) !important; gap: 8px !important; }
          .qr-cell { page-break-inside: avoid; break-inside: avoid; }
        }
      `}</style>

            <PageHeader
                title="Masa QR Kodları"
                subtitle={`${TABLE_COUNT} masa`}
                action={<PrintButton />}
            />

            <div className="qr-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-2">
                {tables.map(({ n, url, dataUrl }) => (
                    <div
                        key={n}
                        className="qr-cell border-2 border-green flex flex-col items-center gap-2 p-4 bg-white"
                    >
                        <span className="font-bowlby text-[22px] uppercase text-green leading-none tracking-[-0.5px]">
                            Masa {n}
                        </span>
                        <div className="relative w-30 h-30">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={dataUrl}
                                alt={`QR code for table ${n}`}
                                className="w-30 h-30"
                            />
                            <div className="absolute inset-0 grid place-items-center pointer-events-none">
                                <div className="bg-white rounded-full">
                                    <Image
                                        src="/Upperdeck_logo_black_white_transparent1.png"
                                        alt=""
                                        width={48}
                                        height={48}
                                        quality={100}
                                        unoptimized
                                        className="w-12 h-12 object-contain rounded-full"
                                    />
                                </div>
                            </div>
                        </div>
                        <span className="font-ui text-[7px] text-warm-gray break-all text-center leading-tight opacity-60">
                            {url}
                        </span>
                        <div data-no-print className="w-full">
                            <TableWaiterToggle
                                tableNumber={n}
                                disabled={disabledTables.includes(n)}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

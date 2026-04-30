import Image from "next/image";

export function Footer() {
    return (
        <footer className="relative bg-green text-bg w-full pt-12 pb-10 px-8 mt-4 border-t-2 border-green">
            {/* KAGU — absolutely positioned, doesn't affect layout */}
            <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-22 right-6 flex flex-col items-center gap-0.5 opacity-90 hover:opacity-100 transition-opacity"
            >
                <Image
                    src="/kagulogoNoBg.png"
                    alt="KAGU"
                    width={100}
                    height={100}
                    className="object-contain"
                    style={{
                        filter: "brightness(0) saturate(100%) invert(95%) sepia(20%) saturate(400%) hue-rotate(330deg) brightness(103%)",
                    }}
                />
                <span
                    className="font-ui text-[8px] uppercase tracking-[0.2em] opacity-50"
                    style={{ color: "#fff1c2" }}
                >
                    Developed by
                </span>
                <span
                    className="font-bowlby text-[14px] uppercase tracking-widest"
                    style={{ color: "#fff1c2" }}
                >
                    KAGU
                </span>
            </a>

            <div className="flex flex-col gap-6">
                {/* Contact */}
                <div className="flex flex-col gap-1">
                    <p className="font-ui font-extrabold text-[9px] tracking-[0.28em] uppercase opacity-60">
                        Contact
                    </p>
                    <a
                        href="mailto:hello@upperdiih.com"
                        className="font-bowlby text-[18px] uppercase tracking-[-0.5px] opacity-90"
                    >
                        upperdeck.help@gmail.com
                    </a>
                    <a
                        href="tel:+905015886575"
                        className="font-ui text-[13px] opacity-70"
                    >
                        +90 501 588 65 75
                    </a>
                </div>

                {/* Socials */}
                <div className="flex flex-col gap-1">
                    <p className="font-ui font-extrabold text-[9px] tracking-[0.28em] uppercase opacity-60">
                        Socials
                    </p>
                    <div className="flex gap-4">
                        <a
                            href="https://instagram.com/upperdeckk"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-80 hover:opacity-100 transition-opacity"
                        >
                            <Image
                                src="/logo-instagram.svg"
                                alt="Instagram"
                                width={28}
                                height={28}
                                style={{
                                    filter: "brightness(0) saturate(100%) invert(95%) sepia(20%) saturate(400%) hue-rotate(330deg) brightness(103%)",
                                }}
                            />
                        </a>

                        <a
                            href="https://tiktok.com/@uupperdeckk"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-80 hover:opacity-100 transition-opacity"
                        >
                            <Image
                                src="/logo-tiktok.svg"
                                alt="TikTok"
                                width={28}
                                height={28}
                                style={{
                                    filter: "brightness(0) saturate(100%) invert(95%) sepia(20%) saturate(400%) hue-rotate(330deg) brightness(103%)",
                                }}
                            />
                        </a>

                        <a
                            href="https://wa.me/905015886575"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-80 hover:opacity-100 transition-opacity"
                        >
                            <Image
                                src="/logo-whatsapp.svg"
                                alt="WhatsApp"
                                width={28}
                                height={28}
                                style={{
                                    filter: "brightness(0) saturate(100%) invert(95%) sepia(20%) saturate(400%) hue-rotate(330deg) brightness(103%)",
                                }}
                            />
                        </a>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-bg/20" />
            </div>
        </footer>
    );
}

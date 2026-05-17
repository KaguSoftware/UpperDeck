"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { getBrowserClient } from "@/lib/supabase/client";
import { Loader } from "@/components/Loader/components";

type HeroMode = "none" | "media" | "featured";
type Item = { id: string; name: string; image_url: string | null; emoji: string };

const MAX_INPUT_SIZE_MB = 10;

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex-1 border-2 px-4 py-2.5 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase cursor-pointer transition-colors",
        active
          ? "bg-green border-green text-bg"
          : "bg-transparent border-green text-green hover:bg-green/10",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function HeroConstructor({
  defaultMode,
  defaultMediaUrl,
  items,
  defaultItemId,
  defaultLabel,
  defaultBadge,
  defaultDiscount,
}: {
  defaultMode: HeroMode;
  defaultMediaUrl?: string | null;
  items: Item[];
  defaultItemId?: string | null;
  defaultLabel?: string | null;
  defaultBadge?: string | null;
  defaultDiscount?: number | null;
}) {
  const [mode, setMode] = useState<HeroMode>(defaultMode);

  const [mediaUrl, setMediaUrl] = useState<string | null>(defaultMediaUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedId, setSelectedId] = useState<string>(defaultItemId ?? "");
  const selected = items.find((i) => i.id === selectedId) ?? null;

  async function handleFile(file: File) {
    setUploadError(null);
    if (file.size > MAX_INPUT_SIZE_MB * 1024 * 1024) {
      setUploadError(`Dosya çok büyük (maks ${MAX_INPUT_SIZE_MB} MB)`);
      return;
    }
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.8,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: "image/webp",
      });
      const path = `hero/${crypto.randomUUID()}.webp`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, compressed, { upsert: false, contentType: "image/webp" });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setMediaUrl(data.publicUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* hidden inputs always submitted */}
      <input type="hidden" name="hero_mode" value={mode} />
      <input type="hidden" name="hero_media_url" value={mediaUrl ?? ""} />

      {/* mode toggle */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
          Hero Modu
        </span>
        <div className="flex gap-0">
          <ModeButton active={mode === "none"} onClick={() => setMode("none")}>
            Yok
          </ModeButton>
          <ModeButton active={mode === "media"} onClick={() => setMode("media")}>
            Görsel
          </ModeButton>
          <ModeButton active={mode === "featured"} onClick={() => setMode("featured")}>
            Öne Çıkan Ürün
          </ModeButton>
        </div>
        <p className="text-[10px] text-green/40">
          {mode === "none" && "Varsayılan metin banner'ını gösterir."}
          {mode === "media" && "Menünün üzerinde özel bir görsel gösterir."}
          {mode === "featured" && "Bir menü ürününü görseli, kayan yazısı ve isteğe bağlı rozeti ile öne çıkarır."}
        </p>
      </div>

      {/* media fields */}
      <div className={["flex flex-col gap-3 border-2 border-green/20 p-4", mode !== "media" ? "hidden" : ""].join(" ")}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          <div className="flex items-start gap-4">
            <div
              className="w-32 h-20 shrink-0 border-2 border-green bg-bg-deep flex items-center justify-center overflow-hidden cursor-pointer"
              onClick={() => inputRef.current?.click()}
            >
              {mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-green/40 font-bold uppercase tracking-wider text-center px-1">
                  Görsel yok
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="bg-orange text-white border-0 px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer disabled:opacity-60 flex items-center gap-2 self-start"
              >
                {uploading && <Loader size="xs" tone="onDark" />}
                {uploading ? "Yükleniyor…" : mediaUrl ? "Değiştir" : "Görsel yükle"}
              </button>
              {mediaUrl && (
                <button
                  type="button"
                  onClick={() => setMediaUrl(null)}
                  className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green/50 hover:text-orange self-start"
                >
                  Kaldır
                </button>
              )}
              {uploadError && <p className="text-[10px] font-bold text-orange">{uploadError}</p>}
              <p className="text-[10px] text-green/40">JPEG, PNG, WEBP, GIF · maks {MAX_INPUT_SIZE_MB} MB · otomatik WebP&apos;ye sıkıştırılır</p>
            </div>
          </div>
      </div>

      {/* featured fields */}
      <div className={["flex flex-col gap-4 border-2 border-green/20 p-4", mode !== "featured" ? "hidden" : ""].join(" ")}>
          {/* item picker */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Ürün
            </span>
            <select
              name="featured_item_id"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            >
              <option value="">— Ürün seç —</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          {/* preview */}
          {selected && (
            <div className="flex items-center gap-3 border-2 border-green/30 p-3 bg-bg-deep">
              <div className="w-14 h-14 shrink-0 overflow-hidden flex items-center justify-center bg-bg">
                {selected.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[28px] leading-none">{selected.emoji}</span>
                )}
              </div>
              <span className="font-ui font-extrabold text-[13px] text-green">{selected.name}</span>
            </div>
          )}

          {/* marquee sentence */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Kayan Yazı
            </span>
            <input
              type="text"
              name="featured_label"
              defaultValue={defaultLabel ?? ""}
              placeholder="örn. İmza yemeğimiz — kaçırmayın"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Görselin alt kısmında kayarak geçer. Boş bırakılırsa ürün adı kullanılır.
            </span>
          </label>

          {/* discount */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              İndirim %
            </span>
            <input
              type="number"
              name="featured_discount"
              defaultValue={defaultDiscount ?? ""}
              min={0}
              max={99}
              placeholder="örn. 20"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Öne çıkan kartta üstü çizili orijinal fiyat ve indirimli fiyat gösterir. İndirim yoksa boş bırakın.
            </span>
          </label>

          {/* badge */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Rozet Metni
            </span>
            <input
              type="text"
              name="featured_badge"
              defaultValue={defaultBadge ?? ""}
              placeholder="örn. SINIRLI SÜRE"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Sağ altta hap biçiminde gösterilir. Gizlemek için boş bırakın.
            </span>
          </label>
      </div>
    </div>
  );
}

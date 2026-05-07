"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { getBrowserClient } from "@/lib/supabase/client";

type HeroMode = "none" | "media" | "featured";
type MediaType = "image" | "video";
type Item = { id: string; name: string; image_url: string | null; emoji: string };

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
  defaultMediaType,
  items,
  defaultItemId,
  defaultLabel,
  defaultBadge,
  defaultDiscount,
}: {
  defaultMode: HeroMode;
  defaultMediaUrl?: string | null;
  defaultMediaType?: MediaType | null;
  items: Item[];
  defaultItemId?: string | null;
  defaultLabel?: string | null;
  defaultBadge?: string | null;
  defaultDiscount?: number | null;
}) {
  const [mode, setMode] = useState<HeroMode>(defaultMode);

  // media state
  const [mediaUrl, setMediaUrl] = useState<string | null>(defaultMediaUrl ?? null);
  const [mediaType, setMediaType] = useState<MediaType | null>(defaultMediaType ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // featured state
  const [selectedId, setSelectedId] = useState<string>(defaultItemId ?? "");
  const selected = items.find((i) => i.id === selectedId) ?? null;

  async function handleFile(file: File) {
    setUploadError(null);
    setUploading(true);
    const isVideo = file.type.startsWith("video/");
    try {
      const supabase = getBrowserClient();
      let uploadFile: File | Blob = file;
      let ext = file.name.split(".").pop() ?? (isVideo ? "mp4" : "jpg");
      let contentType = file.type;

      if (!isVideo) {
        uploadFile = await imageCompression(file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: "image/webp",
        });
        ext = "webp";
        contentType = "image/webp";
      }

      const path = `hero/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, uploadFile, { upsert: false, contentType });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setMediaUrl(data.publicUrl);
      setMediaType(isVideo ? "video" : "image");
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
      <input type="hidden" name="hero_media_type" value={mediaType ?? ""} />

      {/* mode toggle */}
      <div className="flex flex-col gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
          Hero Mode
        </span>
        <div className="flex gap-0">
          <ModeButton active={mode === "none"} onClick={() => setMode("none")}>
            None
          </ModeButton>
          <ModeButton active={mode === "media"} onClick={() => setMode("media")}>
            Media
          </ModeButton>
          <ModeButton active={mode === "featured"} onClick={() => setMode("featured")}>
            Featured Product
          </ModeButton>
        </div>
        <p className="text-[10px] text-green/40">
          {mode === "none" && "Shows the default text banner."}
          {mode === "media" && "Shows a custom image or video above the menu."}
          {mode === "featured" && "Highlights a menu item with its image, a scrolling sentence, and an optional badge."}
        </p>
      </div>

      {/* media fields */}
      <div className={["flex flex-col gap-3 border-2 border-green/20 p-4", mode !== "media" ? "hidden" : ""].join(" ")}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
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
              {mediaUrl && mediaType === "video" ? (
                <video src={mediaUrl} className="w-full h-full object-cover" muted playsInline />
              ) : mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-green/40 font-bold uppercase tracking-wider text-center px-1">
                  No media
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
                {uploading && (
                  <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                )}
                {uploading ? "Uploading…" : mediaUrl ? "Replace" : "Upload image or video"}
              </button>
              {mediaUrl && (
                <button
                  type="button"
                  onClick={() => { setMediaUrl(null); setMediaType(null); }}
                  className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green/50 hover:text-orange self-start"
                >
                  Remove
                </button>
              )}
              {mediaType && (
                <span className="text-[10px] font-bold text-green/50 uppercase tracking-[0.14em]">
                  Type: {mediaType}
                </span>
              )}
              {uploadError && <p className="text-[10px] font-bold text-orange">{uploadError}</p>}
              <p className="text-[10px] text-green/40">JPEG, PNG, WEBP, GIF, MP4, WEBM · max 50 MB</p>
            </div>
          </div>
      </div>

      {/* featured fields */}
      <div className={["flex flex-col gap-4 border-2 border-green/20 p-4", mode !== "featured" ? "hidden" : ""].join(" ")}>
          {/* item picker */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Item
            </span>
            <select
              name="featured_item_id"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            >
              <option value="">— Pick an item —</option>
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
              Marquee Sentence
            </span>
            <input
              type="text"
              name="featured_label"
              defaultValue={defaultLabel ?? ""}
              placeholder="e.g. Our signature dish — don't miss it"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Scrolls across the bottom of the image. Defaults to item name if empty.
            </span>
          </label>

          {/* discount */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Discount %
            </span>
            <input
              type="number"
              name="featured_discount"
              defaultValue={defaultDiscount ?? ""}
              min={0}
              max={99}
              placeholder="e.g. 20"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Shows a strikethrough original price and discounted price on the featured card. Leave empty for no discount.
            </span>
          </label>

          {/* badge */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
              Badge Text
            </span>
            <input
              type="text"
              name="featured_badge"
              defaultValue={defaultBadge ?? ""}
              placeholder="e.g. LIMITED TIME"
              className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
            />
            <span className="text-[10px] text-green/40">
              Pill shown bottom-right. Leave empty to hide.
            </span>
          </label>
      </div>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";

export function ImageField({ defaultUrl }: { defaultUrl?: string | null }) {
  const [url, setUrl] = useState<string | null>(defaultUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("menu-images")
        .upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
      setUrl(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
        Image
      </span>

      {/* Hidden input carries the URL into the server action */}
      <input type="hidden" name="image_url" value={url ?? ""} />

      {/* File input (hidden, triggered by button) */}
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
        {/* Preview */}
        <div
          className="w-20 h-20 shrink-0 border-2 border-green bg-bg-deep flex items-center justify-center overflow-hidden cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-green/40 font-bold uppercase tracking-wider text-center px-1">
              No image
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="bg-orange text-white border-0 px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 self-start"
          >
            {uploading && (
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
            )}
            {uploading ? "Uploading…" : url ? "Replace image" : "Upload image"}
          </button>

          {url && (
            <button
              type="button"
              onClick={() => setUrl(null)}
              className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green/50 hover:text-orange self-start"
            >
              Remove
            </button>
          )}

          {error && (
            <p className="text-[10px] font-bold text-orange">{error}</p>
          )}

          <p className="text-[10px] text-green/40">
            JPEG, PNG, WEBP or GIF · max 5 MB
          </p>
        </div>
      </div>
    </div>
  );
}

import type { LoaderProps, LoaderSize } from "./types";
import { LOGO_SRC, SIZE_MAP } from "./constants";

export function Loader({ size = "md", tone = "onLight", label, className }: LoaderProps) {
  const dims = SIZE_MAP[size];
  const strokeColor = tone === "onDark" ? "#F6F6F6" : "#FF5138";
  const logoSize = dims.logo;
  const ringSize = dims.ring;
  const strokeWidth = dims.stroke;

  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.28;

  return (
    <div
      role="status"
      aria-label={label ?? "Loading"}
      className={["inline-flex flex-col items-center justify-center gap-2", className ?? ""].join(" ")}
    >
      <div
        className="relative grid place-items-center"
        style={{ width: ringSize, height: ringSize }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_SRC}
          alt=""
          width={logoSize}
          height={logoSize}
          style={{
            width: logoSize,
            height: logoSize,
            animation: "logoPulse 1.6s ease-in-out infinite",
            transformOrigin: "center",
          }}
          draggable={false}
        />
        <svg
          width={ringSize}
          height={ringSize}
          viewBox={`0 0 ${ringSize} ${ringSize}`}
          className="absolute inset-0"
          style={{ animation: "spinRing 1.2s linear infinite", transformOrigin: "center" }}
          aria-hidden
        >
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
          />
        </svg>
      </div>
      {label && (
        <span
          className={[
            "font-bowlby uppercase tracking-[0.2em] leading-none",
            tone === "onDark" ? "text-bg" : "text-green",
            size === "lg" ? "text-[14px]" : size === "md" ? "text-[12px]" : "text-[10px]",
          ].join(" ")}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export type { LoaderProps, LoaderSize };

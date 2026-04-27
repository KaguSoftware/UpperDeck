"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  step,
  min,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number;
  required?: boolean;
  step?: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        step={step}
        min={min}
        placeholder={placeholder}
        className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
      />
    </label>
  );
}

export function Textarea({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={rows}
        className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white resize-y"
      />
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  required,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-green">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="border-2 border-green bg-bg px-3 py-2.5 font-ui text-[14px] text-ink focus:outline-none focus:bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Checkbox({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="on"
        className="w-4 h-4 accent-orange"
      />
      <span className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-green">
        {label}
      </span>
    </label>
  );
}

export function PrimaryButton({
  children,
  type = "submit",
}: {
  children: React.ReactNode;
  type?: "submit" | "button";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type={type}
      disabled={pending}
      className="bg-orange text-white border-0 px-4 py-2.5 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="border-2 border-green text-green bg-transparent px-4 py-2 font-ui font-extrabold text-[11px] tracking-[0.22em] uppercase"
    >
      {children}
    </Link>
  );
}

export function DangerButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-green-dark text-bg border-0 px-3 py-2 font-ui font-extrabold text-[10px] tracking-[0.2em] uppercase cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
    >
      {pending && <Spinner size="sm" />}
      {children}
    </button>
  );
}

function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";
  return (
    <span
      className={`${dim} border-2 border-current border-t-transparent rounded-full animate-spin inline-block`}
    />
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b-2 border-green pb-4 mb-6">
      <div>
        <h1 className="font-bowlby text-[34px] leading-[0.9] text-green tracking-[-0.5px] uppercase">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[10px] tracking-[0.22em] font-bold text-green/70 uppercase mt-1.5">
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </header>
  );
}

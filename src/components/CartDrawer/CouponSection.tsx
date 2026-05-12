"use client";

import { useState, useTransition } from "react";
import { subscribeNewsletter } from "@/lib/newsletter/subscribe";

type Props = {
  couponLabel: string;
  couponPlaceholder: string;
  couponApply: string;
  noOfferTitle: string;
  noOfferBody: string;
  emailPlaceholder: string;
  subscribeLabel: string;
  subscribedMessage: string;
  noCouponPrefix: string;
  noCouponLink: string;
};

export function CouponSection({
  couponLabel,
  couponPlaceholder,
  couponApply,
  noOfferTitle,
  noOfferBody,
  emailPlaceholder,
  subscribeLabel,
  subscribedMessage,
  noCouponPrefix,
  noCouponLink,
}: Props) {
  const [code, setCode] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [newsletterOpen, setNewsletterOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [subscribeError, setSubscribeError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleApply() {
    if (!code.trim()) return;
    setAttempted(true);
    setNewsletterOpen(true);
  }

  function handleSubscribe() {
    if (!email.trim() || isPending) return;
    setSubscribeError(false);
    startTransition(async () => {
      const result = await subscribeNewsletter(email);
      if (result.ok) {
        setSubscribed(true);
      } else {
        setSubscribeError(true);
      }
    });
  }

  return (
    <div className="shrink-0 px-4.5 py-2 border-y border-green/20">
      {/* coupon input */}
      <div className="font-extrabold text-[8px] tracking-[0.22em] text-green uppercase mb-1">
        {couponLabel}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setAttempted(false); setNewsletterOpen(false); }}
          placeholder={couponPlaceholder}
          className="flex-1 border border-green/30 focus:border-orange outline-none font-ui text-[11px] text-green bg-transparent px-2 py-1 placeholder:text-green/40 uppercase tracking-widest"
        />
        <button
          type="button"
          onClick={handleApply}
          className="border-2 border-green text-green font-ui font-extrabold text-[9px] tracking-[0.18em] uppercase px-2.5 py-1 cursor-pointer hover:bg-green hover:text-bg transition-colors"
        >
          {couponApply}
        </button>
      </div>

      {/* inline "no coupon?" hint */}
      {!newsletterOpen && (
        <div className="mt-1 font-ui text-[9px] text-green/50">
          {noCouponPrefix}{" "}
          <button
            type="button"
            onClick={() => setNewsletterOpen(true)}
            className="text-orange underline cursor-pointer bg-transparent border-0 font-ui text-[9px] p-0"
          >
            {noCouponLink}
          </button>
        </div>
      )}

      {/* newsletter panel */}
      {newsletterOpen && (
        <div className="mt-3 border border-green/20 p-3 bg-green/5 relative">
          <button
            type="button"
            onClick={() => { setNewsletterOpen(false); setAttempted(false); }}
            className="absolute top-2 right-2 border-0 bg-transparent text-green/40 hover:text-orange cursor-pointer font-bowlby text-[16px] leading-none"
          >
            ×
          </button>
          {attempted && (
            <div className="font-bowlby text-[13px] text-green uppercase tracking-[-0.3px] mb-0.5">
              {noOfferTitle}
            </div>
          )}
          <div className="font-ui text-[11px] text-green/70 mb-2.5">
            {noOfferBody}
          </div>
          {subscribed ? (
            <div className="font-ui font-extrabold text-[11px] text-orange tracking-wide">
              {subscribedMessage}
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSubscribeError(false); }}
                  placeholder={emailPlaceholder}
                  className="flex-1 border border-green/30 focus:border-orange outline-none font-ui text-[12px] text-green bg-transparent px-2.5 py-1.5 placeholder:text-green/40"
                />
                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={isPending}
                  className="bg-orange text-white border-0 font-ui font-extrabold text-[10px] tracking-[0.18em] uppercase px-3 py-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "…" : subscribeLabel}
                </button>
              </div>
              {subscribeError && (
                <p className="mt-1.5 font-ui text-[10px] text-orange">
                  Something went wrong. Please try again.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

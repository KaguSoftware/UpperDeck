"use client";

import { useEffect, useRef } from "react";
import type { PhoneFrameProps } from "./types";
import { FRAME_WIDTH, FRAME_HEIGHT, MIN_WIDTH_BREAKPOINT, FRAME_PADDING } from "./constants";
import styles from "./styles.module.css";

export function PhoneFrame({ children }: PhoneFrameProps) {
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fit() {
      const phone = phoneRef.current;
      if (!phone) return;
      const sw = window.innerWidth;
      const sh = window.innerHeight;
      if (sw < MIN_WIDTH_BREAKPOINT) {
        phone.style.removeProperty("--scale");
        return;
      }
      const s = Math.min(1, (sw - FRAME_PADDING) / FRAME_WIDTH, (sh - FRAME_PADDING) / FRAME_HEIGHT);
      phone.style.setProperty("--scale", String(s));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.phone} ref={phoneRef}>
        <div className={styles.notch} />
        <div className={styles.home} />
        <div className={styles.screen}>
          <div className={styles.statusbar}>
            <span>9:41</span>
            <div className={styles.statusIcons}>
              {/* signal */}
              <svg width="17" height="11" viewBox="0 0 17 11">
                <g fill="currentColor">
                  <rect x="0" y="7" width="3" height="4" />
                  <rect x="4" y="5" width="3" height="6" />
                  <rect x="8" y="3" width="3" height="8" />
                  <rect x="12" y="0" width="3" height="11" />
                </g>
              </svg>
              {/* wifi */}
              <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
                <path d="M8 11l-2-2.5c1.1-.9 2.9-.9 4 0L8 11zm-5-6.2C4.5 3.4 6.2 2.7 8 2.7s3.5.7 5 2.1l1.5-1.6C12.8 1.4 10.5.5 8 .5S3.2 1.4 1.5 3.2L3 4.8zM5.7 7.5c.7-.6 1.5-.9 2.3-.9s1.6.3 2.3.9l1.5-1.6C10.7 4.9 9.4 4.4 8 4.4s-2.7.5-3.8 1.5l1.5 1.6z" />
              </svg>
              {/* battery */}
              <svg width="27" height="12" viewBox="0 0 27 12">
                <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" fill="none" />
                <rect x="2" y="2" width="19" height="8" rx="1.5" fill="currentColor" />
                <rect x="23.5" y="3.5" width="2" height="5" rx="1" fill="currentColor" />
              </svg>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

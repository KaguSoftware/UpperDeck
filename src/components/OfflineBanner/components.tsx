"use client";

import { useEffect, useState } from "react";

export function OfflineBanner({ message }: { message: string }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function update() {
      setOffline(!navigator.onLine);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-100000 bg-orange text-white font-ui font-extrabold text-[10px] tracking-[0.22em] uppercase px-4 py-2 text-center"
    >
      {message}
    </div>
  );
}

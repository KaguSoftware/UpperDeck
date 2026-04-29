"use client";

import { createContext, useContext, useState } from "react";

export type RealtimeConnectionState =
  | "idle"          // not on /admin/orders
  | "connecting"
  | "connected"
  | "disconnected";

type RealtimeContextValue = {
  connectionState: RealtimeConnectionState;
  setConnectionState: (s: RealtimeConnectionState) => void;
};

const RealtimeContext = createContext<RealtimeContextValue>({
  connectionState: "idle",
  setConnectionState: () => {},
});

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] =
    useState<RealtimeConnectionState>("idle");

  return (
    <RealtimeContext.Provider value={{ connectionState, setConnectionState }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeConnection() {
  return useContext(RealtimeContext);
}

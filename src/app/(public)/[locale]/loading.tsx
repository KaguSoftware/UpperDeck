export default function Loading() {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-bg">
      {/* TopBar */}
      <div className="flex items-center px-4 py-3 border-b-2 border-green gap-3">
        <div className="w-[54px] h-[54px] rounded-full shimmer shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 w-32 shimmer" />
          <div className="h-3 w-20 shimmer" />
        </div>
        <div className="h-8 w-20 shimmer" />
      </div>

      {/* Hero */}
      <div className="h-[140px] w-full shimmer" />

      {/* FilterPills */}
      <div className="flex items-center gap-3 px-4 py-4 h-[80px]">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-full shimmer" />
        ))}
      </div>

      {/* Menu cards */}
      <div className="flex-1 overflow-hidden px-4 flex flex-col gap-3 py-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-32 w-full border-2 border-green/10 shimmer" />
        ))}
      </div>

      {/* Ticker */}
      <div className="h-8 w-full shimmer" />
    </div>
  );
}

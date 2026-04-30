export default function Loading() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r-2 border-green bg-bg-deep hidden lg:flex flex-col">
        <div className="h-16 border-b-2 border-green shimmer" />
        <div className="flex-1 flex flex-col gap-1 py-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 mx-4 my-1 shimmer" />
          ))}
        </div>
        <div className="h-20 border-t-2 border-green shimmer mx-4 mb-4" />
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 flex flex-col gap-6">
        {/* Toolbar */}
        <div className="flex items-center gap-4">
          <div className="h-4 w-16 shimmer" />
          <div className="h-9 w-28 shimmer" />
        </div>

        {/* Order cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border-2 border-green bg-white p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="h-12 w-16 shimmer" />
                <div className="h-5 w-20 shimmer" />
              </div>
              <div className="h-4 shimmer" />
              <div className="h-4 shimmer" />
              <div className="h-4 shimmer" />
              <div className="border-t border-green/20 pt-2 flex justify-between">
                <div className="h-3 w-10 shimmer" />
                <div className="h-8 w-24 shimmer" />
              </div>
              <div className="flex gap-2 flex-wrap">
                {[...Array(4)].map((_, j) => (
                  <div key={j} className="h-8 w-20 shimmer border-2 border-green/20" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

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
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 shimmer" />
          <div className="h-3 w-32 shimmer" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border-2 border-green h-28 shimmer" />
          ))}
        </div>
      </main>
    </div>
  );
}

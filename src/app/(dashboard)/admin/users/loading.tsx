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
        {/* PageHeader */}
        <div className="flex flex-col gap-2">
          <div className="h-8 w-48 shimmer" />
          <div className="h-3 w-32 shimmer" />
        </div>

        {/* Invite form */}
        <div className="border-2 border-green bg-white p-5 max-w-2xl grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-4">
          <div className="flex flex-col gap-1">
            <div className="h-3 w-16 shimmer" />
            <div className="h-9 shimmer" />
          </div>
          <div className="flex flex-col gap-1">
            <div className="h-3 w-12 shimmer" />
            <div className="h-9 shimmer" />
          </div>
          <div className="flex items-end">
            <div className="h-9 w-24 shimmer" />
          </div>
        </div>

        {/* Table */}
        <div className="border-2 border-green bg-white">
          <div className="grid grid-cols-[1fr_1fr_8rem_8rem] gap-3 px-4 py-3 bg-bg-deep border-b-2 border-green">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-3 shimmer" />
            ))}
          </div>
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_8rem_8rem] gap-3 px-4 py-3 border-b border-green/20 items-center"
            >
              <div className="h-4 shimmer" />
              <div className="h-4 shimmer" />
              <div className="h-4 shimmer" />
              <div className="h-4 shimmer" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

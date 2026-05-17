import { Loader } from "@/components/Loader/components";

export default function Loading() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r-2 border-green bg-bg-deep hidden lg:flex flex-col">
        <div className="h-16 border-b-2 border-green shimmer" />
        <div className="flex-1 flex flex-col gap-1 py-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 mx-4 my-1 shimmer" />
          ))}
        </div>
        <div className="h-20 border-t-2 border-green shimmer mx-4 mb-4" />
      </aside>
      <main className="flex-1 grid place-items-center">
        <Loader size="lg" />
      </main>
    </div>
  );
}

import { Loader } from "@/components/Loader/components";

export default function Loading() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-bg">
      <Loader size="lg" />
      <div className="font-hero text-[28px] tracking-[-0.5px] uppercase text-green/80 leading-none">
        UPPER<span className="text-orange">DECK</span>
      </div>
    </div>
  );
}

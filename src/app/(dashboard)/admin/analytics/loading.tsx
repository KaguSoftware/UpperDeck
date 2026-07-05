import { Loader } from "@/components/Loader/components";

export default function Loading() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader size="lg" />
    </div>
  );
}

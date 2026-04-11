import { Skeleton } from "@/components/ui/skeleton";

export default function CardDetailLoading() {
  return (
    <div className="container mx-auto py-8 px-4">
      <Skeleton className="h-4 w-24 mb-4" />
      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <Skeleton className="aspect-[2.5/3.5] w-full max-w-[280px] rounded-lg" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function BrowseLoading() {
  return (
    <div className="container mx-auto py-8 px-4">
      <Skeleton className="h-9 w-48 mb-6" />
      <div className="flex gap-8">
        <div className="w-56 shrink-0 hidden lg:block space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-[2.5/3.5] w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="container mx-auto py-16 px-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Not Found</h2>
      <p className="text-muted-foreground mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className={cn(buttonVariants())}>
        Go Home
      </Link>
    </div>
  );
}

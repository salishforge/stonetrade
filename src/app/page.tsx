import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl mb-4">
            The marketplace for emerging CCGs
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Buy, sell, and discover fair prices for Wonders of the First, Bo
            Jackson Battle Arena, and more. Community-driven price discovery for
            games with no established market values.
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="/browse"
              className={cn(buttonVariants({ size: "lg" }))}
            >
              Browse Cards
            </a>
            <a
              href="/create-listing"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Start Selling
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-center mb-10">
            How StoneTrade Works
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Price Discovery</CardTitle>
                <CardDescription>
                  Community-powered pricing from sales, polls, buylists, and
                  market data. Every price shows its confidence level.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Seller Marketplace</CardTitle>
                <CardDescription>
                  List singles, bundles, mystery packs, and sealed product.
                  Manage your inventory with offers and negotiation.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Collection Tracking</CardTitle>
                <CardDescription>
                  Track your collection value over time. Set completion
                  progress, acquisition costs, and portfolio analytics.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Supported Games */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-6">Supported Games</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Wonders of the First</CardTitle>
                <CardDescription>
                  Existence Set &mdash; 401 cards across 6 Orbitals. Classic
                  Paper, Foil, Formless Foil, OCM, and Stonefoil treatments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href="/browse?game=wotf"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Browse WoTF
                </a>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Bo Jackson Battle Arena</CardTitle>
                <CardDescription>
                  Alpha Edition with numbered parallels, SP heroes, Superfoil
                  1/1s, and Inspired Ink on-card autographs.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href="/browse?game=bjba"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Browse BJBA
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

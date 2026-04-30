export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="container mx-auto py-8 flex gap-8">
      <aside className="w-56 shrink-0 hidden md:block">
        <nav className="space-y-1 text-sm">
          <a href="/listings" className="block px-3 py-2 rounded-md hover:bg-muted">Listings</a>
          <a href="/orders" className="block px-3 py-2 rounded-md hover:bg-muted">Orders</a>
          <a href="/offers" className="block px-3 py-2 rounded-md hover:bg-muted">Offers</a>
          <a href="/collection" className="block px-3 py-2 rounded-md hover:bg-muted">Collection</a>
          <a href="/buylist" className="block px-3 py-2 rounded-md hover:bg-muted">Buylist</a>
          <a href="/dragon-scales" className="block px-3 py-2 rounded-md hover:bg-muted">Dragon Scales</a>
          <a href="/dragon-stable" className="block px-3 py-2 rounded-md hover:bg-muted">Dragon Stable</a>
          <a href="/settings" className="block px-3 py-2 rounded-md hover:bg-muted">Settings</a>
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

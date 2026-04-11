export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Card Detail</h1>
      <p className="text-muted-foreground">Card {id} detail page coming soon.</p>
    </div>
  );
}

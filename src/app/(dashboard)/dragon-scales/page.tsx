// Dragon Scales — the user's foil-card binder. Lists every scale, shows
// total Dragon Points and progress toward the threshold, and exposes the
// AddScaleDialog. Server-rendered for the initial load; the dialog and the
// scale table are client components that mutate via /api/dragon-scales.

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DRAGON_POINT_THRESHOLD } from "@/lib/dragon/constants";
import { AddScaleDialog } from "./AddScaleDialog";
import { ScalesTable } from "./ScalesTable";

export default async function DragonScalesPage() {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;

  const scales = await prisma.dragonScale.findMany({
    where: { userId: user.id },
    include: {
      card: {
        select: {
          id: true,
          name: true,
          cardNumber: true,
          rarity: true,
          treatment: true,
          imageUrl: true,
          isStoneseeker: true,
          isLoreMythic: true,
          isToken: true,
          set: { select: { code: true, name: true } },
        },
      },
      // Active locks: any LockedScale whose parent binderLock hasn't been
      // released. Used by the table to disable mutations + show a chip.
      lockedIn: {
        where: { binderLock: { releasedAt: null } },
        select: {
          binderLock: {
            select: {
              registration: {
                select: { event: { select: { name: true, slug: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: [{ pointsCached: "desc" }, { createdAt: "desc" }],
  });

  const registration = await prisma.dragonRegistration.findUnique({
    where: { ownerType_userOwnerId: { ownerType: "USER", userOwnerId: user.id } },
  });

  const totalPoints = scales.reduce((sum, s) => sum + s.pointsCached, 0);
  const pct = Math.min(100, Math.round((totalPoints / DRAGON_POINT_THRESHOLD) * 100));
  const isActive = registration != null && registration.dissolvedAt == null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Dragon Scales</h1>
          <p className="text-sm text-muted-foreground">
            Track your Wonders of the First foil collection. Reach {DRAGON_POINT_THRESHOLD.toLocaleString()} Dragon Points to register a Dragon.
          </p>
        </div>
        <AddScaleDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="md:col-span-2">
          <CardContent className="pt-4 pb-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted-foreground">Total Dragon Points</p>
              {isActive ? (
                <Badge variant="default">Dragon Registered</Badge>
              ) : registration?.dissolvedAt ? (
                <Badge variant="outline">Dragon Dissolved</Badge>
              ) : (
                <Badge variant="outline">Forming</Badge>
              )}
            </div>
            <p className="text-2xl font-bold">
              {totalPoints.toLocaleString()}
              <span className="text-base font-normal text-muted-foreground">
                {" / "}
                {DRAGON_POINT_THRESHOLD.toLocaleString()}
              </span>
            </p>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Scales</p>
            <p className="text-2xl font-bold">{scales.length}</p>
            <p className="text-xs text-muted-foreground">
              {scales.reduce((sum, s) => sum + s.quantity, 0)} total copies
            </p>
          </CardContent>
        </Card>
      </div>

      <ScalesTable initialScales={scales} />
    </div>
  );
}

// Pack contract page — view current version, sign outstanding signatures,
// propose a new version, see the audit trail.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProposeVersionForm } from "./ProposeVersionForm";
import { SignButton } from "./SignButton";

export default async function PackContractPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return <p>Please sign in.</p>;
  const { slug } = await params;

  const pack = await prisma.huntingPack.findUnique({
    where: { slug },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { id: true, username: true, displayName: true } } },
      },
      contract: {
        include: {
          versions: {
            include: {
              createdBy: { select: { username: true, displayName: true } },
              dragonRider: { select: { id: true, username: true, displayName: true } },
              signatories: {
                include: {
                  user: { select: { id: true, username: true, displayName: true } },
                  signature: true,
                },
              },
            },
            orderBy: { versionNumber: "desc" },
          },
          auditLog: {
            include: { actor: { select: { username: true, displayName: true } } },
            orderBy: { createdAt: "desc" },
            take: 50,
          },
        },
      },
    },
  });
  if (!pack) notFound();
  const isMember = pack.members.some((m) => m.userId === user.id);
  if (!isMember) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          You&apos;re not a member of this pack.
        </CardContent>
      </Card>
    );
  }

  const contract = pack.contract;
  const currentVersion = contract?.versions.find((v) => v.id === contract.currentVersionId);
  const myOutstanding =
    currentVersion?.signatories.filter((s) => s.userId === user.id && !s.signature) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-muted-foreground">Hunting Pack contract</p>
        <h1 className="text-2xl font-bold">{pack.name}</h1>
        <a href={`/hunting-packs/${pack.slug}`} className="text-xs underline text-muted-foreground">
          ← back to pack
        </a>
      </div>

      {!contract ? (
        <Card>
          <CardContent className="py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              No contract yet. Propose the first version below — every current pack member is automatically named.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>
                Current version: v{currentVersion?.versionNumber ?? "—"}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                proposed by {currentVersion?.createdBy.displayName ?? currentVersion?.createdBy.username} ·{" "}
                {currentVersion?.createdAt.toLocaleString()}
              </p>
            </div>
            <Badge>{contract.status.replace(/_/g, " ").toLowerCase()}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentVersion && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Payout mode</p>
                    <p className="font-medium">
                      {currentVersion.payoutMode.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Rider payment</p>
                    <p className="font-medium">
                      {currentVersion.riderPaymentMode === "PERCENT"
                        ? `${currentVersion.riderPaymentValue.toString()}%`
                        : `$${currentVersion.riderPaymentValue.toString()}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Dragon Rider</p>
                    <p className="font-medium">
                      {currentVersion.dragonRider
                        ? currentVersion.dragonRider.displayName ?? currentVersion.dragonRider.username
                        : "— not appointed —"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Body hash (SHA-256)</p>
                    <p className="font-mono text-[11px] break-all">{currentVersion.bodyHash}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-2">Signatories</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Party</th>
                          <th className="text-left px-3 py-2 font-medium">Role</th>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                          <th className="text-left px-3 py-2 font-medium">Signed at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentVersion.signatories.map((s) => (
                          <tr key={s.id} className="border-t">
                            <td className="px-3 py-2">
                              {s.user.displayName ?? s.user.username}{" "}
                              <span className="text-xs text-muted-foreground">@{s.user.username}</span>
                            </td>
                            <td className="px-3 py-2 capitalize">{s.role.replace(/_/g, " ").toLowerCase()}</td>
                            <td className="px-3 py-2">
                              {s.signature ? (
                                <Badge variant="default">signed</Badge>
                              ) : (
                                <Badge variant="outline">pending</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {s.signature ? s.signature.signedAt.toLocaleString() : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {myOutstanding.length > 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950 dark:border-amber-800">
                    <p className="text-sm mb-2">
                      Your signature is required on this version (
                      {myOutstanding.map((s) => s.role.replace(/_/g, " ").toLowerCase()).join(", ")}
                      ).
                    </p>
                    <SignButton
                      packId={pack.id}
                      versionId={currentVersion.id}
                      roles={myOutstanding.map((s) => s.role)}
                    />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Propose a new version</CardTitle>
        </CardHeader>
        <CardContent>
          <ProposeVersionForm
            packId={pack.id}
            members={pack.members.map((m) => ({
              userId: m.userId,
              username: m.user.username,
              displayName: m.user.displayName,
            }))}
            currentRiderUserId={currentVersion?.dragonRiderUserId ?? null}
          />
        </CardContent>
      </Card>

      {contract && contract.auditLog.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {contract.auditLog.map((entry) => (
                <li key={entry.id} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    {entry.createdAt.toLocaleString()}
                  </span>
                  <span className="font-medium">
                    {entry.action.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.actor
                      ? `· ${entry.actor.displayName ?? entry.actor.username}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

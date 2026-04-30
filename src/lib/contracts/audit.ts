// Append-only audit log writes for PackContract events.
//
// Always called inside the same Prisma client as the mutating write, so a
// transaction can wrap "do the thing AND record it". The helper takes the
// client to make that explicit — callers must pass either the singleton
// `prisma` (for atomicity not required) or a transaction client.

import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import type { ContractAuditAction } from "@/generated/prisma/enums";

type Client = Pick<PrismaClient, "contractAuditLog">;

export interface AuditEntryInput {
  contractId: string;
  versionId?: string | null;
  actorUserId?: string | null;
  action: ContractAuditAction;
  payload?: Prisma.InputJsonValue | null;
}

export function recordAudit(client: Client, input: AuditEntryInput) {
  return client.contractAuditLog.create({
    data: {
      contractId: input.contractId,
      versionId: input.versionId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      payloadJson: input.payload ?? undefined,
    },
  });
}

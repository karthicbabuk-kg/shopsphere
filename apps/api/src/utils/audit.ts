import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/prisma.js';

interface AuditInput {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
}

/** Fire-and-forget safe audit entry; never includes secrets. */
export async function audit(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? undefined,
      ip: input.ip ?? null,
    },
  });
}

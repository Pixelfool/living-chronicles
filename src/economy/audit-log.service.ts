import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

/**
 * Append-only economy audit trail (architecture.md §4.7, build-plan-v1.md
 * M7). Always called from inside the same transaction as the action it
 * records, and always before commit - the record of "what happened" must
 * survive independently of whether anything ever listens for the
 * corresponding domain event (architecture.md §4.7's rationale for audit
 * logs over full event sourcing).
 */
@Injectable()
export class AuditLogService {
  async record(
    tx: TransactionClient,
    action: string,
    actorId: string,
    detail: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLogEntry.create({
      data: { action, actorId, detail },
    });
  }
}

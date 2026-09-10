import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/** In-app notification helper. Each entry also acts as the event ledger. */
export async function notify(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: string;
    title: string;
    body: string;
    requestId?: Id<"emergencyRequests">;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    requestId: args.requestId,
    read: false,
    createdAt: Date.now(),
  });
}

/** Append-only audit trail. Failures must never block the primary action. */
export async function audit(
  ctx: MutationCtx,
  args: {
    actorId?: Id<"users">;
    action: string;
    target: string;
    meta?: Record<string, unknown>;
  },
) {
  try {
    await ctx.db.insert("auditLogs", {
      actorId: args.actorId,
      action: args.action,
      target: args.target,
      meta: args.meta,
      createdAt: Date.now(),
    });
  } catch {
    // audit must not break the user-facing flow
  }
}

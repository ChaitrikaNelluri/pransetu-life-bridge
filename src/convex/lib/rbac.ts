import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import type { Role } from "../schema";

export async function requireUser(
  ctx: QueryCtx,
): Promise<Doc<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHENTICATED");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("UNAUTHENTICATED");
  if (user.suspended) {
    throw new Error("ACCOUNT_SUSPENDED: contact an administrator");
  }
  return user;
}

export async function requireRole(
  ctx: QueryCtx,
  roles: Role[],
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!user.role || !roles.includes(user.role)) {
    throw new Error(`FORBIDDEN: requires role ${roles.join(" or ")}`);
  }
  return user;
}

export async function requireAdmin(ctx: QueryCtx) {
  return requireRole(ctx, ["admin"]);
}

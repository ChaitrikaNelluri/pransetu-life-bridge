import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import { audit } from "./lib/events";

/** File a report against a request or user. Any member can report. */
export const file = mutation({
  args: {
    requestId: v.optional(v.id("emergencyRequests")),
    targetUserId: v.optional(v.id("users")),
    category: v.union(
      v.literal("FAKE_REQUEST"),
      v.literal("SPAM"),
      v.literal("ABUSE"),
      v.literal("FALSE_INFORMATION"),
      v.literal("SUSPICIOUS_ACCOUNT"),
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (!args.requestId && !args.targetUserId) {
      throw new Error("TARGET_REQUIRED");
    }
    await ctx.db.insert("reports", {
      reporterId: user._id,
      requestId: args.requestId,
      targetUserId: args.targetUserId,
      category: args.category,
      details: args.details?.trim(),
      status: "open",
      createdAt: Date.now(),
    });
    await audit(ctx, {
      actorId: user._id,
      action: "REPORT_FILED",
      target: args.requestId
        ? `request:${args.requestId}`
        : `user:${args.targetUserId}`,
      meta: { category: args.category },
    });
    return { ok: true };
  },
});

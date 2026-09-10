import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";

/** The signed-in user's notifications, newest first. */
export const forUser = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.userId && args.userId !== user._id) {
      throw new Error("FORBIDDEN");
    }
    return await ctx.db
      .query("notifications")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(30);
  },
});

export const markAllRead = mutation({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", false))
      .collect();
    for (const n of unread) {
      await ctx.db.patch(n._id, { read: true });
    }
    return { marked: unread.length };
  },
});

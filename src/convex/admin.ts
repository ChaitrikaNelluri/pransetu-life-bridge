import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/rbac";
import { audit } from "./lib/events";

export const pendingOrgs = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("organizations")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "blood_bank").eq("verificationStatus", "pending"),
      )
      .collect();
  },
});

export const activeRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .order("desc")
      .take(50);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const orgs = await ctx.db.query("organizations").collect();
    const donors = await ctx.db.query("donorProfiles").collect();
    const activeReqs = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    return {
      activeRequests: activeReqs.length,
      pendingOrgs: orgs.filter((o) => o.verificationStatus === "pending")
        .length,
      verifiedOrgs: orgs.filter((o) => o.verificationStatus === "verified")
        .length,
      donors: donors.length,
    };
  },
});

export const auditTrail = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_created")
      .order("desc")
      .take(50);
  },
});

export const verifyOrg = mutation({
  args: { orgId: v.id("organizations"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const org = await ctx.db.get(args.orgId);
    if (!org) throw new Error("ORG_NOT_FOUND");
    if (org.verificationStatus !== "pending") {
      throw new Error("ALREADY_REVIEWED");
    }
    await ctx.db.patch(args.orgId, {
      verificationStatus: args.approve ? "verified" : "rejected",
      verifiedBy: admin._id,
    });
    await audit(ctx, {
      actorId: admin._id,
      action: args.approve
        ? "ADMIN_VERIFIED_ORG"
        : "ADMIN_REJECTED_ORG",
      target: `org:${args.orgId}`,
      meta: { name: org.name, type: org.type },
    });
    return { ok: true };
  },
});

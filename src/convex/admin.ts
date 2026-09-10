import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./lib/rbac";
import { audit } from "./lib/events";
import { findCandidates } from "./requests";
import { SEARCH_RADII_KM, NOTIFY_BATCH_SIZE } from "./lib/constants";
import { assertTransition } from "./lib/stateMachine";
import { notify } from "./lib/events";

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

/** All emergency requests in states that need administrative eyes. */
export const verificationQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .order("asc")
      .take(50);
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const orgs = await ctx.db.query("organizations").collect();
    const donors = await ctx.db.query("donorProfiles").collect();
    const users = await ctx.db.query("users").collect();
    const reqs = await ctx.db.query("emergencyRequests").collect();
    const openReports = await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    return {
      activeRequests: reqs.filter((r) =>
        ["ACTIVE", "DONOR_CONTACTED", "DONOR_ACCEPTED", "PARTIALLY_FULFILLED"].includes(r.status),
      ).length,
      pendingOrgs: orgs.filter((o) => o.verificationStatus === "pending").length,
      verifiedOrgs: orgs.filter((o) => o.verificationStatus === "verified").length,
      donors: donors.length,
      availableDonors: donors.filter((d) => d.available).length,
      users: users.length,
      fulfilled: reqs.filter((r) => ["FULFILLED", "CLOSED"].includes(r.status)).length,
      expired: reqs.filter((r) => r.status === "EXPIRED").length,
      openReports: openReports.length,
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
      .take(80);
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
      action: args.approve ? "BLOOD_BANK_VERIFIED" : "ADMIN_REJECTED_ORG",
      target: `org:${args.orgId}`,
      meta: { name: org.name, type: org.type },
    });
    return { ok: true };
  },
});

/** User directory with role/name filters. */
export const users = query({
  args: {
    role: v.optional(
      v.union(
        v.literal("donor"),
        v.literal("requester"),
        v.literal("blood_bank"),
        v.literal("hospital"),
        v.literal("admin"),
        v.literal("user"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = args.role
      ? await ctx.db
          .query("users")
          .withIndex("by_role", (q) => q.eq("role", args.role))
          .take(100)
      : await ctx.db.query("users").take(100);
    return rows.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      suspended: !!u.suspended,
      _creationTime: u._creationTime,
    }));
  },
});

/** Suspend or restore a user account (abuse control). */
export const setUserSuspension = mutation({
  args: { userId: v.id("users"), suspended: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (args.userId === admin._id) {
      throw new Error("CANNOT_SUSPEND_SELF");
    }
    await ctx.db.patch(args.userId, { suspended: args.suspended });
    await audit(ctx, {
      actorId: admin._id,
      action: args.suspended ? "USER_SUSPENDED" : "USER_RESTORED",
      target: `user:${args.userId}`,
    });
    return { ok: true };
  },
});

/** Verify or reject a submitted emergency request (verification workflow). */
export const verifyRequest = mutation({
  args: { requestId: v.id("emergencyRequests"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.status !== "SUBMITTED") throw new Error("NOT_PENDING_VERIFICATION");

    if (!args.approve) {
      assertTransition(request.status, "REJECTED");
      await ctx.db.patch(request._id, {
        status: "REJECTED",
        verificationStatus: "rejected",
        verifiedBy: admin._id,
      });
      await notify(ctx, {
        userId: request.requesterId,
        type: "REQUEST_REJECTED",
        title: "Request not approved",
        body: `Your ${request.bloodGroup} request at ${request.hospitalName} was not approved after review.`,
        requestId: request._id,
      });
      await audit(ctx, {
        actorId: admin._id,
        action: "REQUEST_VERIFIED",
        target: `request:${args.requestId}`,
        meta: { decision: "rejected" },
      });
      return { ok: true };
    }

    assertTransition(request.status, "ACTIVE");
    await ctx.db.patch(request._id, {
      status: "ACTIVE",
      verificationStatus: "verified",
      verifiedBy: admin._id,
    });

    // First notification wave.
    const candidates = await findCandidates(
      ctx,
      { bloodGroup: request.bloodGroup, lat: request.lat, lng: request.lng },
      SEARCH_RADII_KM[0],
      NOTIFY_BATCH_SIZE,
    );
    const fresh = candidates.filter(
      (c) => !(request.notified ?? []).includes(c.userId as never),
    );
    const title = `${request.urgency === "critical" ? "CRITICAL" : "Emergency"}: ${request.bloodGroup} needed`;
    const body = `${request.bloodGroup} blood needed at ${request.hospitalName}, ${request.city}.`;
    for (const c of fresh) {
      await notify(ctx, {
        userId: c.userId as never,
        type: "REQUEST_MATCHED",
        title,
        body,
        requestId: request._id,
      });
    }
    if (candidates.length > 0) {
      await ctx.db.patch(request._id, { status: "DONOR_CONTACTED" });
    }
    await ctx.db.patch(request._id, {
      notified: [
        ...(request.notified ?? []),
        ...candidates.map((c) => c.userId as never),
      ],
    });

    await notify(ctx, {
      userId: request.requesterId,
      type: "REQUEST_VERIFIED",
      title: "Request verified and live",
      body: `Your ${request.bloodGroup} request at ${request.hospitalName} is now active. ${fresh.length} nearby donors were notified.`,
      requestId: request._id,
    });

    await audit(ctx, {
      actorId: admin._id,
      action: "REQUEST_VERIFIED",
      target: `request:${args.requestId}`,
      meta: { decision: "approved", notified: fresh.length },
    });
    return { ok: true };
  },
});

/** Open reports queue. */
export const openReports = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("reports")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .order("desc")
      .take(50);
  },
});

/** Resolve or dismiss a report. */
export const resolveReport = mutation({
  args: {
    reportId: v.id("reports"),
    outcome: v.union(v.literal("resolved"), v.literal("dismissed")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (!report) throw new Error("REPORT_NOT_FOUND");
    await ctx.db.patch(args.reportId, {
      status: args.outcome,
      resolvedBy: admin._id,
    });
    await audit(ctx, {
      actorId: admin._id,
      action: "REPORT_RESOLVED",
      target: `report:${args.reportId}`,
      meta: { outcome: args.outcome, category: report.category },
    });
    return { ok: true };
  },
});

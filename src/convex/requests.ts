import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import {
  bloodGroupValidator,
  urgencyValidator,
  SEARCH_RADII_KM,
  MAX_DONOR_CANDIDATES,
  REQUEST_TTL_HOURS,
  NOTIFY_BATCH_SIZE,
  DUPLICATE_WINDOW_MINUTES,
  AUTO_VERIFY_MINUTES,
  type BloodGroup,
} from "./lib/constants";
import { boundingBox, haversineKm } from "./lib/geo";
import { scoreCandidate, type ScoredCandidate } from "./lib/matching";
import { compatibleDonorsFor } from "./lib/compatibility";
import { assertTransition, statusAfterFulfillment, OPEN_FOR_RESPONSES } from "./lib/stateMachine";
import { notify, audit } from "./lib/events";
import type { RequestStatus } from "./schema";

// ---------------------------------------------------------------------------
// Matching engine. Two-phase search: index-friendly bounding-box candidates,
// then exact haversine scoring with progressive radius expansion.
// ---------------------------------------------------------------------------

export async function findCandidates(
  ctx: import("./_generated/server").QueryCtx,
  request: { bloodGroup: BloodGroup; lat: number; lng: number },
  maxRadiusKm: number,
  limit = MAX_DONOR_CANDIDATES,
): Promise<ScoredCandidate[]> {
  const compatible = compatibleDonorsFor(request.bloodGroup);
  const box = boundingBox(request.lat, request.lng, maxRadiusKm);

  // Bounding-box prefilter across all compatible groups (uses the index).
  const candidates = [];
  for (const group of compatible) {
    const rows = await ctx.db
      .query("donorProfiles")
      .withIndex("by_blood_availability", (q) =>
        q.eq("bloodGroup", group).eq("available", true),
      )
      .collect();
    candidates.push(...rows);
  }

  // Exact distance + scoring.
  const scored = candidates
    .filter(
      (c) =>
        c.lat >= box.minLat &&
        c.lat <= box.maxLat &&
        c.lng >= box.minLng &&
        c.lng <= box.maxLng,
    )
    .map(
      (c) =>
        scoreCandidate(
          {
            userId: c.userId,
            bloodGroup: c.bloodGroup,
            lat: c.lat,
            lng: c.lng,
            available: c.available,
            lastDonationDate: c.lastDonationDate,
          },
          request.bloodGroup,
          { lat: request.lat, lng: request.lng },
        ),
    )
    .filter((s): s is ScoredCandidate => s !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

/** Notify a set of ranked candidates. Idempotent via the notified array. */
async function notifyCandidates(
  ctx: import("./_generated/server").MutationCtx,
  requestId: string,
  request: {
    bloodGroup: BloodGroup;
    hospitalName: string;
    city: string;
    urgency: string;
  },
  candidates: ScoredCandidate[],
  alreadyNotified: string[],
): Promise<number> {
  const fresh = candidates.filter((c) => !alreadyNotified.includes(c.userId));
  const title = `${request.urgency === "critical" ? "CRITICAL" : "Emergency"}: ${request.bloodGroup} needed`;
  const body = `${request.bloodGroup} blood needed at ${request.hospitalName}, ${request.city}.`;
  for (const c of fresh) {
    await notify(ctx, {
      userId: c.userId as never,
      type: "REQUEST_MATCHED",
      title,
      body,
      requestId: requestId as never,
    });
  }
  return fresh.length;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const get = query({
  args: { id: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db.get(args.id);
  },
});

export const responses = query({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return await ctx.db
      .query("requestResponses")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .order("asc")
      .collect();
  },
});

export const active = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .order("desc")
      .take(50);
  },
});

/** All requests in open (non-terminal) states — the live ledger view. */
export const open = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const statuses = [
      "SUBMITTED",
      "VERIFICATION_PENDING",
      "ACTIVE",
      "DONOR_CONTACTED",
      "DONOR_ACCEPTED",
      "PARTIALLY_FULFILLED",
    ] as const;
    const results = [];
    for (const status of statuses) {
      const rows = await ctx.db
        .query("emergencyRequests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .order("desc")
        .take(30);
      results.push(...rows);
    }
    return results.sort((a, b) => {
      const w = { critical: 0, urgent: 1, routine: 2 } as const;
      if (w[a.urgency] !== w[b.urgency]) return w[a.urgency] - w[b.urgency];
      return b._creationTime - a._creationTime;
    });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("emergencyRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(50);
  },
});

/** All requests filed by one user — includes terminal states for history. */
export const mineAll = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("emergencyRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(100);
  },
});

/** Active compatible requests near a donor, prioritized. */
export const activeNearby = query({
  args: { lat: v.number(), lng: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const rows = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .order("desc")
      .take(100);

    return rows
      .map((r) => ({
        ...r,
        distanceKm: haversineKm(args.lat, args.lng, r.lat, r.lng),
      }))
      .filter((r) => r.distanceKm <= 50)
      .sort((a, b) => {
        const w = { critical: 0, urgent: 1, routine: 2 } as const;
        if (w[a.urgency] !== w[b.urgency]) return w[a.urgency] - w[b.urgency];
        return a.requiredBy - b.requiredBy;
      })
      .slice(0, 20);
  },
});

/** Explainable ranked match sheet for one request. */
export const matches = query({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    return await findCandidates(
      ctx,
      {
        bloodGroup: request.bloodGroup,
        lat: request.lat,
        lng: request.lng,
      },
      SEARCH_RADII_KM[SEARCH_RADII_KM.length - 1],
      12,
    );
  },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export const create = mutation({
  args: {
    patientRef: v.string(),
    bloodGroup: bloodGroupValidator,
    unitsRequired: v.number(),
    urgency: urgencyValidator,
    hospitalName: v.string(),
    city: v.string(),
    lat: v.number(),
    lng: v.number(),
    contactPhone: v.string(),
    requiredBy: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (
      user.role !== "requester" &&
      user.role !== "hospital" &&
      user.role !== "admin"
    ) {
      throw new Error(
        "FORBIDDEN: only requesters and hospital coordinators can file emergencies",
      );
    }

    // Validation — never trust the client.
    if (!args.patientRef.trim()) throw new Error("INVALID_PATIENT_REF");
    if (!args.hospitalName.trim()) throw new Error("INVALID_HOSPITAL");
    if (!args.contactPhone.trim()) throw new Error("INVALID_CONTACT");
    if (args.unitsRequired < 1 || args.unitsRequired > 10) {
      throw new Error("INVALID_UNITS");
    }
    if (args.lat < -90 || args.lat > 90 || args.lng < -180 || args.lng > 180) {
      throw new Error("INVALID_COORDINATES");
    }
    if (args.requiredBy < Date.now()) throw new Error("REQUIRED_BY_IN_PAST");
    if (args.requiredBy > Date.now() + 14 * 24 * 3600 * 1000) {
      throw new Error("REQUIRED_BY_TOO_FAR");
    }

    // Rate limit: max 5 filings per user per hour (coordination guard),
    // then duplicate guard: same requester, group, hospital in the window.
    const myRecent = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(5);
    const recentCount = myRecent.filter(
      (r) => Date.now() - r._creationTime < 60 * 60 * 1000,
    ).length;
    if (recentCount >= 5) throw new Error("RATE_LIMITED: try again later");

    const dupe = myRecent.find(
      (r) =>
        r.status !== "CANCELLED" &&
        r.status !== "REJECTED" &&
        r.bloodGroup === args.bloodGroup &&
        r.hospitalName === args.hospitalName &&
        Date.now() - r._creationTime < DUPLICATE_WINDOW_MINUTES * 60 * 1000,
    );
    if (dupe) throw new Error("DUPLICATE_REQUEST");

    const now = Date.now();
    // Verification workflow: SUBMITTED first; coordinators' filings are
    // trusted (hospital-signed). Everyone else waits for admin/coordinator
    // review, with a grace auto-activation so genuine emergencies are never
    // blocked for long.
    const autoActive = user.role === "hospital" || user.role === "admin";
    const id = await ctx.db.insert("emergencyRequests", {
      requesterId: user._id,
      patientRef: args.patientRef.trim(),
      bloodGroup: args.bloodGroup,
      unitsRequired: args.unitsRequired,
      unitsFulfilled: 0,
      urgency: args.urgency,
      hospitalName: args.hospitalName.trim(),
      city: args.city,
      lat: args.lat,
      lng: args.lng,
      requiredBy: args.requiredBy,
      contactPhone: args.contactPhone.trim(),
      description: args.description?.trim(),
      status: autoActive ? "ACTIVE" : "SUBMITTED",
      verificationStatus: autoActive ? "verified" : "unverified",
      verifiedBy: autoActive ? user._id : undefined,
      expiresAt: now + REQUEST_TTL_HOURS * 3600 * 1000,
      radiusKm: SEARCH_RADII_KM[0],
    });

    let notified = 0;
    if (autoActive) {
      const candidates = await findCandidates(
        ctx,
        { bloodGroup: args.bloodGroup, lat: args.lat, lng: args.lng },
        SEARCH_RADII_KM[0],
        NOTIFY_BATCH_SIZE,
      );
      notified = await notifyCandidates(ctx, id, args, candidates, []);
      if (candidates.length > 0) {
        await ctx.db.patch(id, { status: "DONOR_CONTACTED" });
      }
    }

    await audit(ctx, {
      actorId: user._id,
      action: "REQUEST_CREATED",
      target: `request:${id}`,
      meta: {
        bloodGroup: args.bloodGroup,
        urgency: args.urgency,
        notified,
      },
    });

    return id;
  },
});

/** Admin / coordinator verification decision on a submitted request. */
export const verify = mutation({
  args: { requestId: v.id("emergencyRequests"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin" && user.role !== "hospital") {
      throw new Error("FORBIDDEN: only admins and coordinators verify");
    }
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.status !== "SUBMITTED") throw new Error("NOT_PENDING_VERIFICATION");

    if (!args.approve) {
      assertTransition(request.status, "REJECTED");
      await ctx.db.patch(request._id, {
        status: "REJECTED",
        verificationStatus: "rejected",
        verifiedBy: user._id,
      });
      await notify(ctx, {
        userId: request.requesterId,
        type: "REQUEST_REJECTED",
        title: "Request not approved",
        body: `Your ${request.bloodGroup} request at ${request.hospitalName} was not approved after review.`,
        requestId: request._id,
      });
      await audit(ctx, {
        actorId: user._id,
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
      verifiedBy: user._id,
    });

    // First notification wave at the initial radius.
    const candidates = await findCandidates(
      ctx,
      { bloodGroup: request.bloodGroup, lat: request.lat, lng: request.lng },
      SEARCH_RADII_KM[0],
      NOTIFY_BATCH_SIZE,
    );
    const notified = await notifyCandidates(
      ctx,
      request._id,
      request,
      candidates,
      [],
    );
    if (candidates.length > 0) {
      await ctx.db.patch(request._id, { status: "DONOR_CONTACTED" });
    }

    await notify(ctx, {
      userId: request.requesterId,
      type: "REQUEST_VERIFIED",
      title: "Request verified and live",
      body: `Your ${request.bloodGroup} request at ${request.hospitalName} is now active. ${notified} nearby donors were notified.`,
      requestId: request._id,
    });

    await audit(ctx, {
      actorId: user._id,
      action: "REQUEST_VERIFIED",
      target: `request:${args.requestId}`,
      meta: { decision: "approved", notified },
    });
    return { ok: true };
  },
});

/** Donor offers to donate (or blood bank confirms availability). */
export const respond = mutation({
  args: {
    requestId: v.id("emergencyRequests"),
    note: v.optional(v.string()),
    units: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (!OPEN_FOR_RESPONSES.includes(request.status)) {
      throw new Error("REQUEST_NOT_ACCEPTING_RESPONSES");
    }

    if (user.role === "donor") {
      const profile = await ctx.db
        .query("donorProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (!profile) throw new Error("NO_DONOR_PROFILE");
      if (!profile.available) throw new Error("NOT_AVAILABLE");

      // Idempotency: one active response per donor per request.
      const existing = await ctx.db
        .query("requestResponses")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect();
      if (
        existing.some(
          (r) => r.responderId === user._id && r.status !== "declined",
        )
      ) {
        throw new Error("ALREADY_RESPONDED");
      }

      await ctx.db.insert("requestResponses", {
        requestId: args.requestId,
        responderId: user._id,
        kind: "donor",
        note: args.note?.trim(),
        status: "offered",
        contactPhone: profile.phone,
        createdAt: Date.now(),
      });

      if (request.status === "ACTIVE" || request.status === "DONOR_CONTACTED") {
        assertTransition(request.status, "DONOR_ACCEPTED");
        await ctx.db.patch(request._id, { status: "DONOR_ACCEPTED" });
      }

      await notify(ctx, {
        userId: request.requesterId,
        type: "DONOR_ACCEPTED",
        title: "A donor has responded",
        body: `A donor responded to your ${request.bloodGroup} request at ${request.hospitalName}. Open the folio for their contact.`,
        requestId: request._id,
      });

      await audit(ctx, {
        actorId: user._id,
        action: "DONOR_ACCEPTED_REQUEST",
        target: `request:${args.requestId}`,
      });
      return { ok: true };
    }

    if (user.role === "blood_bank" && user.orgId) {
      const org = await ctx.db.get(user.orgId);
      if (!org || org.verificationStatus !== "verified") {
        throw new Error("ORG_NOT_VERIFIED");
      }
      // Idempotency: one active response per org per request.
      const existing = await ctx.db
        .query("requestResponses")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect();
      if (
        existing.some(
          (r) =>
            r.responderId === user._id &&
            r.kind === "blood_bank" &&
            r.status !== "declined",
        )
      ) {
        throw new Error("ALREADY_RESPONDED");
      }

      await ctx.db.insert("requestResponses", {
        requestId: args.requestId,
        responderId: user._id,
        kind: "blood_bank",
        units: args.units,
        note: args.note?.trim(),
        status: "offered",
        contactPhone: org.contactPhone,
        createdAt: Date.now(),
      });

      await notify(ctx, {
        userId: request.requesterId,
        type: "BLOOD_BANK_RESPONDED",
        title: "A blood bank responded",
        body: `${org.name} can help with your ${request.bloodGroup} request.`,
        requestId: request._id,
      });

      await audit(ctx, {
        actorId: user._id,
        action: "BLOOD_BANK_RESPONDED",
        target: `request:${args.requestId}`,
        meta: { units: args.units },
      });
      return { ok: true };
    }

    throw new Error("FORBIDDEN");
  },
});

/** Donor withdraws an offered response. */
export const decline = mutation({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("requestResponses")
      .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
      .collect();
    const mine = existing.find(
      (r) => r.responderId === user._id && r.status === "offered",
    );
    if (!mine) throw new Error("NO_OFFER_TO_WITHDRAW");
    await ctx.db.patch(mine._id, { status: "declined" });
    await audit(ctx, {
      actorId: user._id,
      action: "DONOR_REJECTED_REQUEST",
      target: `request:${args.requestId}`,
    });
    return { ok: true };
  },
});

/** Requester records one unit received — atomic, transaction-safe counting. */
export const markFulfilled = mutation({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.requesterId !== user._id && user.role !== "admin") {
      throw new Error("FORBIDDEN");
    }
    if (request.unitsFulfilled >= request.unitsRequired) {
      throw new Error("ALREADY_FULFILLED");
    }
    if (!OPEN_FOR_RESPONSES.includes(request.status) && request.status !== "ACTIVE") {
      throw new Error("REQUEST_CLOSED");
    }

    const unitsFulfilled = request.unitsFulfilled + 1;
    const next = statusAfterFulfillment(
      request.status,
      unitsFulfilled,
      request.unitsRequired,
    );
    await ctx.db.patch(request._id, {
      unitsFulfilled,
      ...(next ? { status: next } : {}),
    });

    if (next === "FULFILLED") {
      const resps = await ctx.db
        .query("requestResponses")
        .withIndex("by_request", (q) => q.eq("requestId", args.requestId))
        .collect();
      for (const r of resps) {
        if (r.status !== "declined") {
          await ctx.db.patch(r._id, { status: "accepted" });
          await notify(ctx, {
            userId: r.responderId,
            type: "REQUEST_FULFILLED",
            title: "Request fulfilled",
            body: `The ${request.bloodGroup} emergency at ${request.hospitalName} has been fulfilled. Thank you.`,
            requestId: request._id,
          });
        }
      }
      await notify(ctx, {
        userId: request.requesterId,
        type: "REQUEST_FULFILLED",
        title: "All units fulfilled",
        body: `Your ${request.bloodGroup} request at ${request.hospitalName} is fully fulfilled. You can now close the folio.`,
        requestId: request._id,
      });
      await audit(ctx, {
        actorId: user._id,
        action: "REQUEST_FULFILLED",
        target: `request:${args.requestId}`,
      });
    }
    return { unitsFulfilled, done: next === "FULFILLED" };
  },
});

/** Requester closes a fulfilled folio. */
export const close = mutation({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.requesterId !== user._id && user.role !== "admin") {
      throw new Error("FORBIDDEN");
    }
    assertTransition(request.status, "CLOSED");
    await ctx.db.patch(request._id, { status: "CLOSED" });
    await audit(ctx, {
      actorId: user._id,
      action: "REQUEST_CLOSED",
      target: `request:${args.requestId}`,
    });
    return { ok: true };
  },
});

/** Requester cancels (or admin rejects) an open request. */
export const cancel = mutation({
  args: { requestId: v.id("emergencyRequests") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("REQUEST_NOT_FOUND");
    if (request.requesterId !== user._id && user.role !== "admin") {
      throw new Error("FORBIDDEN");
    }
    assertTransition(request.status, "CANCELLED");
    await ctx.db.patch(request._id, { status: "CANCELLED" });
    await audit(ctx, {
      actorId: user._id,
      action: "REQUEST_CANCELLED",
      target: `request:${args.requestId}`,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------------------
// Background jobs (cron-driven — the BullMQ equivalent on Convex)
// ---------------------------------------------------------------------------

/** Cron: expire overdue open requests. */
export const expireOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const statuses: RequestStatus[] = ["SUBMITTED", "VERIFICATION_PENDING", "ACTIVE", "DONOR_CONTACTED", "DONOR_ACCEPTED", "PARTIALLY_FULFILLED"];
    let expired = 0;
    for (const status of statuses) {
      const rows = await ctx.db
        .query("emergencyRequests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const r of rows) {
        if (r.expiresAt < now) {
          assertTransition(r.status, "EXPIRED");
          await ctx.db.patch(r._id, { status: "EXPIRED" });
          await notify(ctx, {
            userId: r.requesterId,
            type: "REQUEST_EXPIRED",
            title: "Request expired",
            body: `Your ${r.bloodGroup} request at ${r.hospitalName} expired unfulfilled after ${REQUEST_TTL_HOURS}h. File a new one if the need remains.`,
            requestId: r._id,
          });
          expired++;
        }
      }
    }
    return { expired };
  },
});

/**
 * Cron: progressive expansion. Every wave, open requests that still need
 * units reach the next radius ring; newly-in-range candidates are notified.
 * Batching prevents spamming the entire donor pool at once.
 */
export const expandWaves = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statuses: RequestStatus[] = [
      "ACTIVE",
      "DONOR_CONTACTED",
      "DONOR_ACCEPTED",
      "PARTIALLY_FULFILLED",
    ];
    let expanded = 0;
    let notifiedTotal = 0;
    for (const status of statuses) {
      const rows = await ctx.db
        .query("emergencyRequests")
        .withIndex("by_status", (q) => q.eq("status", status))
        .collect();
      for (const r of rows) {
        if (r.unitsFulfilled >= r.unitsRequired) continue;
        const currentIdx = SEARCH_RADII_KM.findIndex(
          (km) => km === (r.radiusKm ?? SEARCH_RADII_KM[0]),
        );
        if (currentIdx >= SEARCH_RADII_KM.length - 1) continue;
        const nextRadius = SEARCH_RADII_KM[currentIdx + 1];
        const candidates = await findCandidates(
          ctx,
          { bloodGroup: r.bloodGroup, lat: r.lat, lng: r.lng },
          nextRadius,
          NOTIFY_BATCH_SIZE * 2,
        );
        const notified = await notifyCandidates(
          ctx,
          r._id,
          r,
          candidates,
          r.notified ?? [],
        );
        await ctx.db.patch(r._id, { radiusKm: nextRadius });
        expanded++;
        notifiedTotal += notified;
      }
    }
    return { expanded, notifiedTotal };
  },
});

/** Cron: auto-activate submitted requests after the grace period. */
export const autoVerifyPending = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - AUTO_VERIFY_MINUTES * 60 * 1000;
    const pending = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .collect();
    let activated = 0;
    for (const r of pending) {
      if (r._creationTime < cutoff) {
        assertTransition(r.status, "ACTIVE");
        await ctx.db.patch(r._id, {
          status: "ACTIVE",
          verificationStatus: "verified",
          verificationNote: "auto-verified after grace period",
        });
        const candidates = await findCandidates(
          ctx,
          { bloodGroup: r.bloodGroup, lat: r.lat, lng: r.lng },
          SEARCH_RADII_KM[0],
          NOTIFY_BATCH_SIZE,
        );
        await notifyCandidates(ctx, r._id, r, candidates, []);
        if (candidates.length > 0) {
          await ctx.db.patch(r._id, { status: "DONOR_CONTACTED" });
        }
        activated++;
      }
    }
    return { activated };
  },
});

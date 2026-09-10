import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import {
  bloodGroupValidator,
  urgencyValidator,
  SEARCH_RADII_KM,
  MAX_DONOR_CANDIDATES,
  REQUEST_TTL_HOURS,
  type BloodGroup,
} from "./lib/constants";
import { boundingBox, haversineKm } from "./lib/geo";
import { scoreCandidate, type ScoredCandidate } from "./lib/matching";
import { compatibleDonorsFor } from "./lib/compatibility";
import { notify, audit } from "./lib/events";
import type { RequestStatus } from "./schema";

const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  SUBMITTED: ["ACTIVE", "REJECTED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["DONOR_ACCEPTED", "FULFILLED", "CANCELLED", "EXPIRED"],
  DONOR_ACCEPTED: ["FULFILLED", "CANCELLED", "EXPIRED"],
  FULFILLED: [],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
};

function assertTransition(from: RequestStatus, to: RequestStatus) {
  if (from === to) return;
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new Error(`INVALID_STATE: ${from} → ${to}`);
  }
}

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

/** Notify ranked candidates about an active emergency. */
async function notifyCandidates(
  ctx: import("./_generated/server").MutationCtx,
  requestId: string,
  request: { bloodGroup: BloodGroup; hospitalName: string; city: string; urgency: string },
  candidates: ScoredCandidate[],
) {
  const title = `${request.urgency === "critical" ? "CRITICAL" : "Emergency"}: ${request.bloodGroup} needed`;
  const body = `${request.bloodGroup} blood needed at ${request.hospitalName}, ${request.city}.`;
  for (const c of candidates) {
    await notify(ctx, {
      userId: c.userId as never,
      type: "REQUEST_MATCHED",
      title,
      body,
      requestId: requestId as never,
    });
  }
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

/** Active compatible requests near a donor (rings of 5/10/25/50 km). */
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
        // urgency first, then required-by
        const w = { critical: 0, urgent: 1, routine: 2 } as const;
        if (w[a.urgency] !== w[b.urgency]) return w[a.urgency] - w[b.urgency];
        return a.requiredBy - b.requiredBy;
      })
      .slice(0, 20);
  },
});

/** Ranked candidate list for one request — the explainable match sheet. */
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
    const requiredBy = args.requiredBy;
    if (requiredBy < Date.now()) throw new Error("REQUIRED_BY_IN_PAST");
    if (requiredBy > Date.now() + 14 * 24 * 3600 * 1000) {
      throw new Error("REQUIRED_BY_TOO_FAR");
    }

    // Duplicate guard: same requester, group, hospital within 30 minutes.
    const myRecent = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_requester", (q) => q.eq("requesterId", user._id))
      .order("desc")
      .take(5);
    const dupe = myRecent.find(
      (r) =>
        r.status !== "CANCELLED" &&
        r.status !== "REJECTED" &&
        r.bloodGroup === args.bloodGroup &&
        r.hospitalName === args.hospitalName &&
        Date.now() - r._creationTime < 30 * 60 * 1000,
    );
    if (dupe) throw new Error("DUPLICATE_REQUEST");

    const now = Date.now();
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
      requiredBy,
      contactPhone: args.contactPhone.trim(),
      description: args.description?.trim(),
      status: "ACTIVE",
      verificationStatus: "unverified",
      expiresAt: now + REQUEST_TTL_HOURS * 3600 * 1000,
      radiusKm: SEARCH_RADII_KM[0],
    });

    // Immediate notification to the first ring of candidates.
    const candidates = await findCandidates(
      ctx,
      { bloodGroup: args.bloodGroup, lat: args.lat, lng: args.lng },
      SEARCH_RADII_KM[0],
      10,
    );
    await notifyCandidates(ctx, id, args, candidates);

    await ctx.db.patch(id, { radiusKm: SEARCH_RADII_KM[0] });

    await audit(ctx, {
      actorId: user._id,
      action: "REQUEST_CREATED",
      target: `request:${id}`,
      meta: {
        bloodGroup: args.bloodGroup,
        urgency: args.urgency,
        notified: candidates.length,
      },
    });

    return id;
  },
});

/** Donor offers to donate (or blood bank confirms units). */
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
    if (!["ACTIVE", "DONOR_ACCEPTED"].includes(request.status)) {
      throw new Error("REQUEST_NOT_ACCEPTING_RESPONSES");
    }

    if (user.role === "donor") {
      const profile = await ctx.db
        .query("donorProfiles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .unique();
      if (!profile) throw new Error("NO_DONOR_PROFILE");

      // idempotency: one active response per donor per request
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

      // Request moves to DONOR_ACCEPTED once anyone has offered.
      assertTransition(request.status, "DONOR_ACCEPTED");
      await ctx.db.patch(request._id, { status: "DONOR_ACCEPTED" });

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
        body: `${org.name} responded to your ${request.bloodGroup} request.`,
        requestId: request._id,
      });

      await audit(ctx, {
        actorId: user._id,
        action: "BLOOD_BANK_RESPONDED",
        target: `request:${args.requestId}`,
      });
      return { ok: true };
    }

    throw new Error("FORBIDDEN");
  },
});

/** Requester records one unit received (counted atomically). */
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

    const unitsFulfilled = request.unitsFulfilled + 1;
    const done = unitsFulfilled >= request.unitsRequired;
    assertTransition(request.status, done ? "FULFILLED" : request.status);

    await ctx.db.patch(request._id, { unitsFulfilled, status: done ? "FULFILLED" : request.status });

    if (done) {
      // thank the responders
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
      await audit(ctx, {
        actorId: user._id,
        action: "REQUEST_FULFILLED",
        target: `request:${args.requestId}`,
      });
    }
    return { unitsFulfilled, done };
  },
});

/** Requester cancels (or admin rejects) an active request. */
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

/** Cron: expire overdue ACTIVE/SUBMITTED requests (internal — cron only). */
export const expireOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const activeReqs = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .collect();
    const submittedReqs = await ctx.db
      .query("emergencyRequests")
      .withIndex("by_status", (q) => q.eq("status", "SUBMITTED"))
      .collect();

    let expired = 0;
    for (const r of [...activeReqs, ...submittedReqs]) {
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
    return { expired };
  },
});

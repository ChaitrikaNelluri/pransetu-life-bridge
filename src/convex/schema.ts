import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";
import {
  bloodGroupValidator,
  urgencyValidator,
} from "./lib/constants";

// ---------------------------------------------------------------------------
// PranSetu — The Bridge for Life
// Convex schema. Convex replaces PostgreSQL here; document-style tables with
// explicit indexes stand in for relational tables, and Convex's built-in
// realtime subscriptions replace the Socket.IO layer of the reference design.
// ---------------------------------------------------------------------------

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  DONOR: "donor",
  REQUESTER: "requester",
  BLOOD_BANK: "blood_bank",
  HOSPITAL: "hospital",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.DONOR),
  v.literal(ROLES.REQUESTER),
  v.literal(ROLES.BLOOD_BANK),
  v.literal(ROLES.HOSPITAL),
);
export type Role = Infer<typeof roleValidator>;

export { bloodGroupValidator, urgencyValidator };
export type BloodGroup = Infer<typeof bloodGroupValidator>;

export const REQUEST_STATUSES = [
  "SUBMITTED",
  "VERIFICATION_PENDING",
  "ACTIVE",
  "DONOR_CONTACTED",
  "DONOR_ACCEPTED",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "CLOSED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
] as const;
export const requestStatusValidator = v.union(
  ...REQUEST_STATUSES.map((s) => v.literal(s)),
);
export type RequestStatus = Infer<typeof requestStatusValidator>;

const schema = defineSchema(
  {
    ...authTables, // do not remove or modify

    users: defineTable({
      name: v.optional(v.string()), // do not remove
      image: v.optional(v.string()), // do not remove
      email: v.optional(v.string()), // do not remove
      emailVerificationTime: v.optional(v.number()), // do not remove
      isAnonymous: v.optional(v.boolean()), // do not remove
      role: v.optional(roleValidator),
      onboarded: v.optional(v.boolean()),
      // Abuse control: suspended users cannot act (see rbac.requireUser).
      suspended: v.optional(v.boolean()),
      // Blood bank / hospital coordinators work under an organization
      orgId: v.optional(v.id("organizations")),
    })
      .index("email", ["email"]) // do not remove or modify
      .index("by_role", ["role"])
      .index("by_org", ["orgId"]),

    // Donor profile. Location is stored as an approximate grid cell plus a
    // precision value (km) so we never persist an exact home address.
    donorProfiles: defineTable({
      userId: v.id("users"),
      bloodGroup: bloodGroupValidator,
      phone: v.optional(v.string()), // shared only when the donor responds
      lat: v.number(),
      lng: v.number(),
      locationLabel: v.string(), // e.g. "Indiranagar, Bengaluru"
      locationPrecisionKm: v.number(), // coarse radius of stored location
      available: v.boolean(),
      lastDonationDate: v.optional(v.string()), // ISO date, self-reported
      verificationStatus: v.union(
        v.literal("unverified"),
        v.literal("verified"),
        v.literal("rejected"),
      ),
    })
      .index("by_user", ["userId"])
      .index("by_blood_availability", ["bloodGroup", "available"]),

    // Blood banks & hospitals. Coordinator users belong to one organization.
    organizations: defineTable({
      name: v.string(),
      type: v.union(v.literal("blood_bank"), v.literal("hospital")),
      contactName: v.string(),
      contactPhone: v.string(),
      address: v.string(),
      city: v.string(),
      lat: v.number(),
      lng: v.number(),
      operatingHours: v.string(),
      verificationStatus: v.union(
        v.literal("pending"),
        v.literal("verified"),
        v.literal("rejected"),
      ),
      verifiedBy: v.optional(v.id("users")),
    }).index("by_type_status", ["type", "verificationStatus"]),

    // Blood inventory. Staleness matters: updatedAt drives the UI confidence.
    bloodInventory: defineTable({
      orgId: v.id("organizations"),
      bloodGroup: bloodGroupValidator,
      units: v.number(),
      updatedAt: v.number(),
    }).index("by_org", ["orgId"]),

    emergencyRequests: defineTable({
      requesterId: v.id("users"),
      patientRef: v.string(), // initials or short label only — data minimization
      bloodGroup: bloodGroupValidator,
      unitsRequired: v.number(),
      unitsFulfilled: v.number(),
      urgency: urgencyValidator,
      hospitalName: v.string(),
      city: v.string(),
      lat: v.number(),
      lng: v.number(),
      requiredBy: v.number(), // epoch ms
      contactPhone: v.string(),
      description: v.optional(v.string()),
      status: requestStatusValidator,
      verificationStatus: v.union(
        v.literal("unverified"),
        v.literal("verified"),
        v.literal("rejected"),
      ),
      verificationNote: v.optional(v.string()),
      verifiedBy: v.optional(v.id("users")),
      expiresAt: v.number(),
      radiusKm: v.optional(v.number()),
      // Donor ids already notified about this request (batching/idempotency).
      notified: v.optional(v.array(v.id("users"))),
    })
      .index("by_status", ["status"])
      .index("by_requester", ["requesterId", "status"]),

    // One row per donor/blood-bank response to a request.
    requestResponses: defineTable({
      requestId: v.id("emergencyRequests"),
      responderId: v.id("users"),
      kind: v.union(v.literal("donor"), v.literal("blood_bank")),
      units: v.optional(v.number()), // units a blood bank can provide
      note: v.optional(v.string()),
      status: v.union(
        v.literal("offered"),
        v.literal("accepted"),
        v.literal("declined"),
      ),
      contactPhone: v.optional(v.string()),
      createdAt: v.number(),
    })
      .index("by_request", ["requestId"])
      .index("by_responder", ["responderId"]),

    // In-app notification ledger (event-driven; replaces FCM/SMS in v1).
    notifications: defineTable({
      userId: v.id("users"),
      type: v.string(),
      title: v.string(),
      body: v.string(),
      requestId: v.optional(v.id("emergencyRequests")),
      read: v.boolean(),
      createdAt: v.number(),
    })
      .index("by_user", ["userId", "read"])
      .index("by_user_created", ["userId"]),

    // Append-only audit trail for sensitive actions (admin + org ops).
    auditLogs: defineTable({
      actorId: v.optional(v.id("users")),
      action: v.string(),
      target: v.string(),
      meta: v.optional(v.any()),
      createdAt: v.number(),
    }).index("by_created", ["createdAt"]),

    // Member reports of suspicious requests or accounts.
    reports: defineTable({
      reporterId: v.id("users"),
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
      status: v.union(v.literal("open"), v.literal("resolved"), v.literal("dismissed")),
      resolvedBy: v.optional(v.id("users")),
      createdAt: v.number(),
    })
      .index("by_status", ["status"])
      .index("by_reporter", ["reporterId"]),

    // Suspension flag for abuse control.
    // (kept on users table as `suspended`)

    // Google Maps geocode cache — cost control: never geocode the same
    // query twice. Rows persist; misses fall back to the built-in gazetteer.
    geocodeCache: defineTable({
      queryKey: v.string(),
      lat: v.number(),
      lng: v.number(),
      source: v.union(v.literal("google"), v.literal("gazetteer")),
      createdAt: v.number(),
    }).index("by_query", ["queryKey"]),
  },
  { schemaValidation: false },
);

export default schema;

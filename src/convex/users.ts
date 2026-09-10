import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { roleValidator, type Role } from "./schema";
import { requireUser } from "./lib/rbac";
import { audit } from "./lib/events";
import { bloodGroupValidator, type BloodGroup } from "./lib/constants";

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.users.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) {
      return null;
    }
    return user;
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};

// ---------------------------------------------------------------------------
// Onboarding — every new member picks exactly one role. This creates the
// role-specific record (donor profile or organization) in the same call.
// ---------------------------------------------------------------------------

const donorDetails = v.object({
  bloodGroup: bloodGroupValidator,
  lat: v.number(),
  lng: v.number(),
  locationLabel: v.string(),
  lastDonationDate: v.optional(v.string()),
});

const orgDetails = v.object({
  name: v.string(),
  type: v.union(v.literal("blood_bank"), v.literal("hospital")),
  contactPhone: v.string(),
  address: v.string(),
  city: v.string(),
  lat: v.number(),
  lng: v.number(),
  operatingHours: v.string(),
});

export const join = mutation({
  args: {
    role: v.union(
      v.literal("donor"),
      v.literal("requester"),
      v.literal("blood_bank"),
      v.literal("hospital"),
    ),
    name: v.string(),
    donor: v.optional(donorDetails),
    org: v.optional(orgDetails),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role && user.role !== "user") {
      throw new Error("ALREADY_ONBOARDED");
    }

    const role = args.role as Role;

    let orgId: Doc<"users">["orgId"] = undefined;
    if (role === "blood_bank" || role === "hospital") {
      if (!args.org) throw new Error("ORG_DETAILS_REQUIRED");
      orgId = await ctx.db.insert("organizations", {
        name: args.org.name,
        type: args.org.type,
        contactName: args.name,
        contactPhone: args.org.contactPhone,
        address: args.org.address,
        city: args.org.city,
        lat: args.org.lat,
        lng: args.org.lng,
        operatingHours: args.org.operatingHours,
        verificationStatus: "pending",
      });
    }

    if (role === "donor") {
      if (!args.donor) throw new Error("DONOR_DETAILS_REQUIRED");
      await ctx.db.insert("donorProfiles", {
        userId: user._id,
        bloodGroup: args.donor.bloodGroup as BloodGroup,
        phone: undefined,
        lat: args.donor.lat,
        lng: args.donor.lng,
        locationLabel: args.donor.locationLabel,
        locationPrecisionKm: 1, // coordinates are rounded to ~1 km at capture
        available: true,
        lastDonationDate: args.donor.lastDonationDate,
        verificationStatus: "unverified",
      });
    }

    // Donors may add a contact number later from their profile.
    await ctx.db.patch(user._id, {
      name: args.name,
      role,
      onboarded: true,
      orgId,
    });

    await audit(ctx, {
      actorId: user._id,
      action: role === "donor" ? "DONOR_REGISTERED" : "USER_JOINED",
      target: `user:${user._id}`,
      meta: { role },
    });

    return { ok: true };
  },
});

export const listRoles = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return { roles: Object.keys(roleValidator.members ?? []) };
  },
});

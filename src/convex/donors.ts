import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import { bloodGroupValidator, type BloodGroup } from "./lib/constants";
import { audit } from "./lib/events";

/** The signed-in user's donor profile, or null. */
export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "donor") return null;
    const profile = await ctx.db
      .query("donorProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    return profile;
  },
});

/** Update donor profile fields (blood group, availability, location). */
export const updateProfile = mutation({
  args: {
    bloodGroup: v.optional(bloodGroupValidator),
    available: v.optional(v.boolean()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    locationLabel: v.optional(v.string()),
    lastDonationDate: v.optional(v.union(v.string(), v.null())),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "donor") throw new Error("FORBIDDEN");
    const profile = await ctx.db
      .query("donorProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("NO_DONOR_PROFILE");

    const patch: Partial<typeof profile> = {};
    if (args.bloodGroup !== undefined) patch.bloodGroup = args.bloodGroup;
    if (args.available !== undefined) patch.available = args.available;
    if (args.lat !== undefined) patch.lat = args.lat;
    if (args.lng !== undefined) patch.lng = args.lng;
    if (args.locationLabel !== undefined)
      patch.locationLabel = args.locationLabel;
    if (args.lastDonationDate !== undefined)
      patch.lastDonationDate = args.lastDonationDate ?? undefined;
    if (args.phone !== undefined) patch.phone = args.phone;

    await ctx.db.patch(profile._id, patch);
    return { ok: true };
  },
});

/** Toggle availability. Unavailable donors are never matched. */
export const setAvailability = mutation({
  args: { available: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "donor") throw new Error("FORBIDDEN");
    const profile = await ctx.db
      .query("donorProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    if (!profile) throw new Error("NO_DONOR_PROFILE");
    await ctx.db.patch(profile._id, { available: args.available });
    return { ok: true };
  },
});

/** Donor's own responses across all requests (history). */
export const myResponses = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const responses = await ctx.db
      .query("requestResponses")
      .withIndex("by_responder", (q) => q.eq("responderId", user._id))
      .order("desc")
      .take(20);

    return Promise.all(
      responses.map(async (resp) => {
        const req = await ctx.db.get(resp.requestId);
        return {
          _id: resp._id,
          requestId: resp.requestId,
          status: resp.status,
          createdAt: resp.createdAt,
          requestSummary: req
            ? `${req.bloodGroup} · ${req.hospitalName}`
            : "Emergency request",
          requestStatus: req?.status ?? "UNKNOWN",
        };
      }),
    );
  },
});

/** Reliability counters used by the matching engine (accept history). */
export async function responseCounts(
  ctx: import("./_generated/server").QueryCtx,
  userIds: string[],
): Promise<Map<string, { accepted: number; total: number }>> {
  const counts = new Map<string, { accepted: number; total: number }>();
  for (const userId of userIds) {
    const responses = await ctx.db
      .query("requestResponses")
      .withIndex("by_responder", (q) => q.eq("responderId", userId as never))
      .collect();
    counts.set(userId, {
      accepted: responses.filter((r) => r.status === "accepted").length,
      total: responses.length,
    });
  }
  return counts;
}

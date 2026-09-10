import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import { bloodGroupValidator } from "./lib/constants";
import { audit } from "./lib/events";

/**
 * Public directory of verified blood banks (and hospitals). Requires sign-in:
 * the directory is for members, not open scrapers.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const orgs = await ctx.db
      .query("organizations")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "blood_bank").eq("verificationStatus", "verified"),
      )
      .collect();

    return Promise.all(
      orgs.map(async (org) => {
        const inventory = await ctx.db
          .query("bloodInventory")
          .withIndex("by_org", (q) => q.eq("orgId", org._id))
          .collect();
        return {
          _id: org._id,
          name: org.name,
          type: org.type,
          address: org.address,
          city: org.city,
          lat: org.lat,
          lng: org.lng,
          operatingHours: org.operatingHours,
          contactPhone: org.contactPhone,
          verificationStatus: org.verificationStatus,
          inventory: inventory.map((i) => ({
            bloodGroup: i.bloodGroup,
            units: i.units,
            updatedAt: i.updatedAt,
          })),
        };
      }),
    );
  },
});

/** The signed-in coordinator's own organization, if any. */
export const myOrg = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user.orgId) return null;
    const org = await ctx.db.get(user.orgId);
    if (!org) return null;
    return {
      _id: org._id,
      name: org.name,
      type: org.type,
      address: org.address,
      city: org.city,
      lat: org.lat,
      lng: org.lng,
      operatingHours: org.operatingHours,
      contactPhone: org.contactPhone,
      verificationStatus: org.verificationStatus,
    };
  },
});

/** The signed-in blood bank's inventory rows. */
export const myInventory = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (!user.orgId) return [];
    const rows = await ctx.db
      .query("bloodInventory")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId!))
      .collect();
    return rows.map((r) => ({
      bloodGroup: r.bloodGroup,
      units: r.units,
      updatedAt: r.updatedAt,
    }));
  },
});

/**
 * Set one blood group's unit count. Stamps a fresh updatedAt so the public
 * directory can show inventory confidence (fresh / aging / stale).
 */
export const setInventoryUnit = mutation({
  args: { bloodGroup: bloodGroupValidator, units: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "blood_bank" || !user.orgId) {
      throw new Error("FORBIDDEN: only a registered blood bank can do this");
    }
    if (args.units < 0 || args.units > 999 || !Number.isInteger(args.units)) {
      throw new Error("INVALID_UNITS");
    }
    const existing = await ctx.db
      .query("bloodInventory")
      .withIndex("by_org", (q) => q.eq("orgId", user.orgId!))
      .collect();
    const row = existing.find((r) => r.bloodGroup === args.bloodGroup);
    if (row) {
      await ctx.db.patch(row._id, {
        units: args.units,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("bloodInventory", {
        orgId: user.orgId,
        bloodGroup: args.bloodGroup,
        units: args.units,
        updatedAt: Date.now(),
      });
    }
    await audit(ctx, {
      actorId: user._id,
      action: "INVENTORY_UPDATED",
      target: `org:${user.orgId}`,
      meta: { bloodGroup: args.bloodGroup, units: args.units },
    });
    return { ok: true };
  },
});

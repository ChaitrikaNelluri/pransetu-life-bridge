import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./lib/rbac";
import { haversineKm } from "./lib/geo";
import type { Id } from "./_generated/dataModel";

/** Health check — dependency probes for the ops dashboard. */
export const health = query({
  args: {},
  handler: async (ctx) => {
    let dbOk = false;
    try {
      await ctx.db.query("users").take(1);
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      ok: dbOk,
      database: dbOk ? "up" : "down",
      // Convex provides scheduling + realtime natively; they are up iff the
      // query itself executed.
      scheduler: "up",
      realtime: "up",
      maps: process.env.GOOGLE_MAPS_API_KEY ? "configured" : "fallback-gazetteer",
      time: Date.now(),
    };
  },
});

/** Map pins: emergency (open), verified blood banks, approximate donor clusters. */
export const mapPins = query({
  args: { centerLat: v.number(), centerLng: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);

    const openStatuses = ["ACTIVE", "DONOR_CONTACTED", "DONOR_ACCEPTED", "PARTIALLY_FULFILLED"] as const;
    const requests = (await ctx.db.query("emergencyRequests").collect())
      .filter((r) => (openStatuses as readonly string[]).includes(r.status))
      .map((r) => ({
        id: r._id,
        kind: "emergency" as const,
        label: `${r.bloodGroup} · ${r.hospitalName}`,
        lat: r.lat,
        lng: r.lng,
        detail: `${r.city} · ${r.urgency}`,
      }));

    const banks = (await ctx.db
      .query("organizations")
      .withIndex("by_type_status", (q) =>
        q.eq("type", "blood_bank").eq("verificationStatus", "verified"),
      )
      .collect()
    ).map((o) => ({
      id: o._id,
      kind: "blood_bank" as const,
      label: o.name,
      lat: o.lat,
      lng: o.lng,
      detail: `${o.city} · ${o.operatingHours}`,
    }));

    // Donor pins are APPROXIMATE — 1 km precision by design. Named only by
    // blood group; no names, no exact coordinates.
    const donorRows = await ctx.db.query("donorProfiles").collect();
    const donors = donorRows
      .filter((d) => d.available)
      .filter(
        (d) => haversineKm(args.centerLat, args.centerLng, d.lat, d.lng) <= 50,
      )
      .map((d) => ({
        id: d._id,
        kind: "donor" as const,
        label: `Donor · ${d.bloodGroup}`,
        lat: d.lat,
        lng: d.lng,
        detail: `approx. ±${d.locationPrecisionKm} km`,
      }));

    return { emergency: requests, bloodBanks: banks, donors };
  },
});



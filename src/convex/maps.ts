import {
  action,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Maps module — Google Maps Platform integration.
 *
 * Architecture (per the approved baseline):
 *   Emergency Location → geo-lib candidate discovery (PostGIS equivalent)
 *   → Google Maps only for geocoding / visualization.
 *
 * Cost control:
 *  - Every geocode result is cached in `geocodeCache` (never geocode twice).
 *  - If no GOOGLE_MAPS_API_KEY is configured, a deterministic built-in
 *    gazetteer of Indian cities is used so the app degrades gracefully
 *    (Maps failure never breaks donor search — see failure-handling spec).
 */

const GAZETTEER: Record<string, { lat: number; lng: number }> = {
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.209 },
  "new delhi": { lat: 28.6139, lng: 77.209 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  indore: { lat: 22.7196, lng: 75.8577 },
  chandigarh: { lat: 30.7333, lng: 76.7794 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  mysore: { lat: 12.2958, lng: 76.6394 },
  coimbatore: { lat: 11.0168, lng: 76.9558 },
  surat: { lat: 21.1702, lng: 72.8311 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
};

async function cachePut(
  ctx: import("./_generated/server").ActionCtx,
  queryKey: string,
  lat: number,
  lng: number,
  source: "google" | "gazetteer",
): Promise<void> {
  // Actions cannot mutate directly; writes go through an internal mutation.
  await ctx.runMutation(internal.maps.putCache, {
    queryKey,
    lat,
    lng,
    source,
  });
}

type GeocodeResult = {
  lat: number;
  lng: number;
  source: "google" | "gazetteer";
};

export const geocode = action({
  args: { query: v.string() },
  handler: async (ctx, args): Promise<GeocodeResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHENTICATED");
    const queryKey = args.query.trim().toLowerCase();
    if (!queryKey) throw new Error("EMPTY_QUERY");

    // 1. Cache lookup — zero API cost for repeats.
    const cached: GeocodeResult | null = await ctx.runQuery(
      internal.maps.getCache,
      { queryKey },
    );
    if (cached) return cached;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    // 2. Google Geocoding API (server-side; key never reaches the client).
    if (apiKey) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(args.query)}&key=${apiKey}`,
        );
        const data = (await res.json()) as {
          status: string;
          results?: {
            geometry: { location: { lat: number; lng: number } };
          }[];
        };
        if (data.status === "OK" && data.results?.[0]) {
          const loc = data.results[0].geometry.location;
          const result = { lat: loc.lat, lng: loc.lng, source: "google" as const };
          await cachePut(ctx, queryKey, loc.lat, loc.lng, "google");
          return result;
        }
      } catch {
        // fall through to gazetteer — Maps failure never breaks the flow
      }
    }

    // 3. Deterministic fallback gazetteer.
    for (const [city, coords] of Object.entries(GAZETTEER)) {
      if (queryKey.includes(city)) {
        const result = { ...coords, source: "gazetteer" as const };
        await cachePut(ctx, queryKey, coords.lat, coords.lng, "gazetteer");
        return result;
      }
    }

    throw new Error("GEOCODE_NOT_FOUND");
  },
});

export const getCache = internalQuery({
  args: { queryKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("geocodeCache")
      .withIndex("by_query", (q) => q.eq("queryKey", args.queryKey))
      .unique();
  },
});

export const putCache = internalMutation({
  args: {
    queryKey: v.string(),
    lat: v.number(),
    lng: v.number(),
    source: v.union(v.literal("google"), v.literal("gazetteer")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("geocodeCache", {
      queryKey: args.queryKey,
      lat: args.lat,
      lng: args.lng,
      source: args.source,
      createdAt: Date.now(),
    });
  },
});

/** Which map provider is active — the UI renders the right experience. */
export const mapConfig = query({
  args: {},
  handler: async () => {
    return {
      hasGoogleMaps: !!process.env.GOOGLE_MAPS_API_KEY,
      // Map tiles need a browser key; reuse the same key when present.
      browserKeyConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
    };
  },
});


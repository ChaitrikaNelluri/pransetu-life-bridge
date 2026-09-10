import { describe, expect, it } from "bun:test";

import {
  TERMINAL_STATUSES,
  OPEN_FOR_RESPONSES,
  assertTransition,
  canTransition,
  statusAfterFulfillment,
} from "../src/convex/lib/stateMachine";
import {
  compatibleDonorsFor,
  isCompatible,
  roughlyEligibleByInterval,
} from "../src/convex/lib/compatibility";
import { boundingBox, haversineKm } from "../src/convex/lib/geo";
import { scoreCandidate, type DonorCandidate } from "../src/convex/lib/matching";
import type { BloodGroup } from "../src/convex/lib/constants";

// ---------------------------------------------------------------------------
// 1. Request state machine
// ---------------------------------------------------------------------------

describe("request state machine", () => {
  it("allows the happy-path lifecycle", () => {
    expect(canTransition("SUBMITTED", "VERIFICATION_PENDING")).toBe(true);
    expect(canTransition("VERIFICATION_PENDING", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "DONOR_CONTACTED")).toBe(true);
    expect(canTransition("DONOR_CONTACTED", "DONOR_ACCEPTED")).toBe(true);
    expect(canTransition("DONOR_ACCEPTED", "PARTIALLY_FULFILLED")).toBe(true);
    expect(canTransition("PARTIALLY_FULFILLED", "FULFILLED")).toBe(true);
    expect(canTransition("FULFILLED", "CLOSED")).toBe(true);
  });

  it("allows fast paths (direct submission → active, partial → fulfilled)", () => {
    expect(canTransition("SUBMITTED", "ACTIVE")).toBe(true);
    expect(canTransition("DONOR_ACCEPTED", "FULFILLED")).toBe(true);
  });

  it("blocks resurrection from terminal states", () => {
    for (const terminal of TERMINAL_STATUSES) {
      expect(canTransition(terminal, "ACTIVE")).toBe(false);
      expect(canTransition(terminal, "SUBMITTED")).toBe(false);
    }
    // CLOSED is a hard terminal — even FULFILLED can't go back.
    expect(canTransition("CLOSED", "FULFILLED")).toBe(false);
  });

  it("allows cancelling/expiring from any open state", () => {
    const openStates = ["SUBMITTED", "VERIFICATION_PENDING", "ACTIVE", "DONOR_CONTACTED", "DONOR_ACCEPTED", "PARTIALLY_FULFILLED"] as const;
    for (const open of openStates) {
      expect(canTransition(open, "CANCELLED")).toBe(true);
      expect(canTransition(open, "EXPIRED")).toBe(true);
    }
    // ...but not from terminal ones.
    expect(canTransition("CLOSED", "CANCELLED")).toBe(false);
    expect(canTransition("FULFILLED", "CANCELLED")).toBe(false);
  });

  it("rejects skipping backwards through the lifecycle", () => {
    expect(canTransition("FULFILLED", "ACTIVE")).toBe(false);
    expect(canTransition("DONOR_ACCEPTED", "SUBMITTED")).toBe(false);
    expect(canTransition("ACTIVE", "SUBMITTED")).toBe(false);
  });

  it("assertTransition throws INVALID_STATE on illegal moves", () => {
    expect(() => assertTransition("CLOSED", "ACTIVE")).toThrow(/INVALID_STATE/);
    expect(() => assertTransition("EXPIRED", "ACTIVE")).toThrow(/INVALID_STATE/);
    expect(() => assertTransition("ACTIVE", "CLOSED")).toThrow(/INVALID_STATE/);
  });

  it("identifies states open for responses", () => {
    expect(OPEN_FOR_RESPONSES).toContain("ACTIVE");
    expect(OPEN_FOR_RESPONSES).toContain("PARTIALLY_FULFILLED");
    expect(OPEN_FOR_RESPONSES).not.toContain("CLOSED");
    expect(OPEN_FOR_RESPONSES).not.toContain("FULFILLED");
  });

  it("marks fulfilment complete when all units are filled", () => {
    expect(statusAfterFulfillment("ACTIVE", 3, 3)).toBe("FULFILLED");
    expect(statusAfterFulfillment("DONOR_ACCEPTED", 2, 2)).toBe("FULFILLED");
  });

  it("marks partial fulfilment when some units are filled", () => {
    expect(statusAfterFulfillment("ACTIVE", 1, 3)).toBe("PARTIALLY_FULFILLED");
    expect(statusAfterFulfillment("DONOR_CONTACTED", 2, 5)).toBe("PARTIALLY_FULFILLED");
  });

  it("returns null when nothing changed (idempotent updates)", () => {
    expect(statusAfterFulfillment("ACTIVE", 0, 3)).toBeNull();
    expect(statusAfterFulfillment("PARTIALLY_FULFILLED", 1, 3)).toBeNull();
  });

  it("refuses fulfilment of a terminal request", () => {
    expect(() => statusAfterFulfillment("CLOSED", 3, 3)).toThrow(/INVALID_STATE/);
    expect(() => statusAfterFulfillment("CANCELLED", 1, 3)).toThrow(/INVALID_STATE/);
  });
});

// ---------------------------------------------------------------------------
// 2. Blood compatibility (application filter only — never a medical verdict)
// ---------------------------------------------------------------------------

describe("blood compatibility", () => {
  it("recognises O- as the universal donor", () => {
    const recipients: BloodGroup[] = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
    for (const r of recipients) {
      expect(isCompatible("O-", r)).toBe(true);
    }
  });

  it("recognises AB+ as the universal recipient", () => {
    const donors: BloodGroup[] = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"];
    for (const d of donors) {
      expect(isCompatible(d, "AB+")).toBe(true);
    }
  });

  it("blocks the universal recipient from donating backwards", () => {
    expect(isCompatible("AB+", "O-")).toBe(false);
    expect(isCompatible("AB+", "A+")).toBe(false);
    expect(isCompatible("AB-", "B+")).toBe(false);
  });

  it("respects Rh direction (positive cannot give to negative)", () => {
    expect(isCompatible("O+", "O-")).toBe(false);
    expect(isCompatible("A+", "A-")).toBe(false);
    expect(isCompatible("O-", "O+")).toBe(true);
    expect(isCompatible("A-", "A+")).toBe(true);
  });

  it("blocks cross-type donation", () => {
    expect(isCompatible("B+", "A+")).toBe(false);
    expect(isCompatible("A+", "B+")).toBe(false);
    expect(isCompatible("O+", "AB-")).toBe(false); // Rh mismatch
  });

  it("always allows exact-group donation", () => {
    for (const g of compatibleDonorsFor("A+")) {
      expect(isCompatible(g, "A+")).toBe(true);
    }
  });

  it("lists compatible donor sets in Rh-consistent order", () => {
    expect(compatibleDonorsFor("O-")).toEqual(["O-"]);
    expect(compatibleDonorsFor("A+")).toEqual(["O-", "O+", "A-", "A+"]);
    expect(compatibleDonorsFor("AB+")).toHaveLength(8);
  });
});

describe("90-day donation interval guard", () => {
  it("passes donors with no recorded donation", () => {
    expect(roughlyEligibleByInterval()).toBe(true);
    expect(roughlyEligibleByInterval(undefined)).toBe(true);
  });

  it("passes malformed dates (fail-open, facility screens anyway)", () => {
    expect(roughlyEligibleByInterval("not-a-date")).toBe(true);
  });

  it("defers donors who gave blood recently", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(roughlyEligibleByInterval(tenDaysAgo)).toBe(false);
  });

  it("clears donors past the 90-day interval", () => {
    const hundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    expect(roughlyEligibleByInterval(hundredDaysAgo)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Geo math (the PostGIS-equivalent two-phase helpers)
// ---------------------------------------------------------------------------

describe("geo math", () => {
  it("computes zero distance for identical points", () => {
    expect(haversineKm(12.9716, 77.5946, 12.9716, 77.5946)).toBeCloseTo(0, 6);
  });

  it("computes ~111 km per degree of longitude at the equator", () => {
    const d = haversineKm(0, 0, 0, 1);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });

  it("computes a plausible Bengaluru → Chennai distance", () => {
    const d = haversineKm(12.9716, 77.5946, 13.0827, 80.2707);
    expect(d).toBeGreaterThan(270);
    expect(d).toBeLessThan(310);
  });

  it("is symmetric", () => {
    const ab = haversineKm(12.9716, 77.5946, 19.076, 72.8777);
    const ba = haversineKm(19.076, 72.8777, 12.9716, 77.5946);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("bounding box contains the centre", () => {
    const bb = boundingBox(12.9716, 77.5946, 10);
    expect(bb.minLat).toBeLessThan(12.9716);
    expect(bb.maxLat).toBeGreaterThan(12.9716);
    expect(bb.minLng).toBeLessThan(77.5946);
    expect(bb.maxLng).toBeGreaterThan(77.5946);
  });

  it("bounding box scales with radius and latitude", () => {
    const ten = boundingBox(12.9716, 77.5946, 10);
    const fifty = boundingBox(12.9716, 77.5946, 50);
    expect(fifty.maxLat - fifty.minLat).toBeGreaterThan(ten.maxLat - ten.minLat);

    // At |lat| → 90°, the lng span must widen (cos shrinks), never collapse.
    const equator = boundingBox(0, 0, 10);
    const polar = boundingBox(89, 0, 10);
    expect(polar.maxLng - polar.minLng).toBeGreaterThan(equator.maxLng - equator.minLng);
  });

  it("bounding box prefilter agrees with haversine (no false negatives)", () => {
    // Any point within the radius must fall inside the box.
    const center = { lat: 12.9716, lng: 77.5946 };
    const radius = 10;
    const bb = boundingBox(center.lat, center.lng, radius);

    // ~5 km north, ~5 km east: both inside radius and inside box.
    const northLat = center.lat + 5 / 111.32;
    const eastLng = center.lng + 5 / (111.32 * Math.cos((center.lat * Math.PI) / 180));
    expect(northLat).toBeGreaterThan(bb.minLat);
    expect(northLat).toBeLessThan(bb.maxLat);
    expect(eastLng).toBeGreaterThan(bb.minLng);
    expect(eastLng).toBeLessThan(bb.maxLng);
  });
});

// ---------------------------------------------------------------------------
// 4. Donor matching score (explainable, deterministic)
// ---------------------------------------------------------------------------

function donor(overrides: Partial<DonorCandidate> = {}): DonorCandidate {
  return {
    userId: "donor-1",
    bloodGroup: "O+",
    lat: 12.9716,
    lng: 77.5946,
    available: true,
    ...overrides,
  };
}

const hospital = { lat: 12.9716, lng: 77.5946 };

describe("donor matching", () => {
  it("scores a perfect no-history candidate at 90 points", () => {
    const result = scoreCandidate(donor(), "O+", hospital);
    expect(result).not.toBeNull();
    // 40 exact group + 20 available + 25 distance(0 km) + 0 reliability + 5 interval
    expect(result!.score).toBe(90);
  });

  it("reaches the 100-point ceiling with a full reliability history", () => {
    const result = scoreCandidate(donor({ acceptedCount: 10, responseCount: 10 }), "O+", hospital)!;
    expect(result.score).toBe(100); // 90 + 10 (100% reliability)
    expect(result.reasons).toContain("100% past response reliability");
  });

  it("scores a compatible (not exact) group lower", () => {
    const exact = scoreCandidate(donor({ bloodGroup: "O+" }), "O+", hospital)!;
    const compatible = scoreCandidate(donor({ bloodGroup: "O-" }), "O+", hospital)!;
    expect(compatible.score).toBeLessThan(exact.score);
    expect(exact.score - compatible.score).toBe(15); // 40 vs 25
  });

  it("explains its ranking in human-readable reasons", () => {
    const result = scoreCandidate(donor(), "O+", hospital)!;
    expect(result.reasons).toContain("Exact blood group match");
    expect(result.reasons).toContain("Marked available right now");
    expect(result.reasons.some((r) => r.includes("km from the hospital"))).toBe(true);
    expect(result.reasons).toContain("No recent-donation deferral on record");
  });

  it("penalises distance linearly", () => {
    const atZero = scoreCandidate(donor(), "O+", hospital)!;
    const at25km = scoreCandidate(donor({ lat: 13.2226, lng: 77.5946 }), "O+", hospital)!;
    expect(at25km.distanceKm).toBeGreaterThan(20);
    expect(at25km.distanceKm).toBeLessThan(30);
    expect(at25km.score).toBeLessThan(atZero.score);
  });

  it("drops candidates beyond the 50 km ring", () => {
    const far = scoreCandidate(donor({ lat: 13.5, lng: 77.5946 }), "O+", hospital);
    expect(far).toBeNull();
  });

  it("drops incompatible donors outright", () => {
    expect(scoreCandidate(donor({ bloodGroup: "B+" }), "O+", hospital)).toBeNull();
    expect(scoreCandidate(donor({ bloodGroup: "AB+" }), "O-", hospital)).toBeNull();
  });

  it("drops donors inside the 90-day deferral window", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(scoreCandidate(donor({ lastDonationDate: tenDaysAgo }), "O+", hospital)).toBeNull();
  });

  it("adds reliability points from past response history", () => {
    const reliable = scoreCandidate(
      donor({ acceptedCount: 4, responseCount: 5 }),
      "O+",
      hospital,
    )!;
    const unknown = scoreCandidate(donor(), "O+", hospital)!;
    expect(reliable.score).toBe(unknown.score + 8); // 80% × 10
    expect(reliable.reasons).toContain("80% past response reliability");
  });

  it("scores unavailable donors lower but keeps them as candidates", () => {
    const unavailable = scoreCandidate(donor({ available: false }), "O+", hospital)!;
    expect(unavailable.score).toBe(70); // 90 − 20 availability points
    expect(unavailable.reasons).not.toContain("Marked available right now");
  });

  it("never exceeds 100 points", () => {
    // O− donor for an O− patient: exact match + full reliability history.
    const result = scoreCandidate(
      donor({ bloodGroup: "O-", acceptedCount: 10, responseCount: 10 }),
      "O-",
      hospital,
    )!;
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("is deterministic — same input, same score", () => {
    const a = scoreCandidate(donor({ acceptedCount: 2, responseCount: 3 }), "A+", hospital);
    const b = scoreCandidate(donor({ acceptedCount: 2, responseCount: 3 }), "A+", hospital);
    expect(a).toEqual(b);
  });
});

import { haversineKm } from "./geo";
import { isCompatible, roughlyEligibleByInterval } from "./compatibility";
import type { BloodGroup } from "./constants";

export interface DonorCandidate {
  userId: string;
  bloodGroup: BloodGroup;
  lat: number;
  lng: number;
  available: boolean;
  lastDonationDate?: string;
  // Filled in by the caller from donorResponses history:
  acceptedCount?: number;
  responseCount?: number;
}

export interface ScoredCandidate extends DonorCandidate {
  distanceKm: number;
  score: number;
  reasons: string[];
}

/**
 * Explainable match score, in points:
 *   compatibility 0..40 (exact group = 40, compatible but not exact = 25)
 *   availability   0..20 (available now = 20)
 *   distance       0..25 (25 at 0 km, linearly to 0 at 50 km)
 *   reliability    0..10 (past accept rate, gently scaled)
 *   freshness      0..5  (not recently donated ⇒ likely eligible)
 * Total 0..100.
 */
export function scoreCandidate(
  candidate: DonorCandidate,
  patient: BloodGroup,
  center: { lat: number; lng: number },
): ScoredCandidate | null {
  if (!isCompatible(candidate.bloodGroup, patient)) return null;
  if (!roughlyEligibleByInterval(candidate.lastDonationDate)) return null;

  const distanceKm = haversineKm(
    center.lat,
    center.lng,
    candidate.lat,
    candidate.lng,
  );
  if (distanceKm > 50) return null;

  const reasons: string[] = [];
  let score = 0;

  const exact = candidate.bloodGroup === patient;
  const compatPts = exact ? 40 : 25;
  score += compatPts;
  reasons.push(
    exact
      ? "Exact blood group match"
      : `Compatible donor type (${candidate.bloodGroup} → ${patient})`,
  );

  if (candidate.available) {
    score += 20;
    reasons.push("Marked available right now");
  }

  const distancePts = Math.max(0, Math.round(25 * (1 - distanceKm / 50)));
  score += distancePts;
  reasons.push(`${distanceKm.toFixed(1)} km from the hospital`);

  const responses = candidate.responseCount ?? 0;
  if (responses > 0 && (candidate.acceptedCount ?? 0) > 0) {
    const rate = (candidate.acceptedCount ?? 0) / responses;
    const reliabilityPts = Math.round(10 * rate);
    score += reliabilityPts;
    reasons.push(`${Math.round(rate * 100)}% past response reliability`);
  }

  score += 5; // passed the 90-day interval guard
  reasons.push("No recent-donation deferral on record");

  return { ...candidate, distanceKm, score, reasons };
}

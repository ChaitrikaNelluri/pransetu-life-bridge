import type { RequestStatus } from "../schema";

/**
 * Emergency request lifecycle — enforced server-side.
 *
 *   SUBMITTED → VERIFICATION_PENDING → ACTIVE → DONOR_CONTACTED
 *     → DONOR_ACCEPTED → PARTIALLY_FULFILLED → FULFILLED → CLOSED
 *
 * Terminal states: CLOSED, CANCELLED, EXPIRED, REJECTED.
 * Invalid transitions (e.g. CLOSED → ACTIVE) always throw.
 */
export const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  SUBMITTED: ["VERIFICATION_PENDING", "ACTIVE", "REJECTED", "CANCELLED", "EXPIRED"],
  VERIFICATION_PENDING: ["ACTIVE", "REJECTED", "CANCELLED", "EXPIRED"],
  ACTIVE: ["DONOR_CONTACTED", "DONOR_ACCEPTED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "EXPIRED"],
  DONOR_CONTACTED: ["DONOR_ACCEPTED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "EXPIRED"],
  DONOR_ACCEPTED: ["PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "EXPIRED"],
  PARTIALLY_FULFILLED: ["DONOR_ACCEPTED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED", "EXPIRED"],
  FULFILLED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  EXPIRED: [],
  REJECTED: [],
};

export const TERMINAL_STATUSES: RequestStatus[] = [
  "CLOSED",
  "CANCELLED",
  "EXPIRED",
  "REJECTED",
  "FULFILLED",
];

/** States in which a request can receive donor / blood-bank responses. */
export const OPEN_FOR_RESPONSES: RequestStatus[] = [
  "ACTIVE",
  "DONOR_CONTACTED",
  "DONOR_ACCEPTED",
  "PARTIALLY_FULFILLED",
];

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  if (from === to) return true;
  return VALID_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus) {
  if (!canTransition(from, to)) {
    throw new Error(`INVALID_STATE: ${from} → ${to}`);
  }
}

/** Next status after recording units; returns null if unchanged. */
export function statusAfterFulfillment(
  current: RequestStatus,
  unitsFulfilled: number,
  unitsRequired: number,
): RequestStatus | null {
  if (unitsFulfilled >= unitsRequired) {
    assertTransition(current, "FULFILLED");
    return "FULFILLED";
  }
  if (unitsFulfilled > 0 && current !== "PARTIALLY_FULFILLED") {
    assertTransition(current, "PARTIALLY_FULFILLED");
    return "PARTIALLY_FULFILLED";
  }
  return null;
}

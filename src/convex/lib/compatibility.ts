import { COMPATIBILITY, type BloodGroup } from "./constants";

/** True when `donor` blood can be given to a `recipient` patient. */
export function isCompatible(donor: BloodGroup, recipient: BloodGroup): boolean {
  return COMPATIBILITY[recipient].includes(donor);
}

/** All groups that can donate to the recipient — for UI display. */
export function compatibleDonorsFor(recipient: BloodGroup): BloodGroup[] {
  return COMPATIBILITY[recipient];
}

/**
 * Rough eligibility guard based on the self-reported last donation date.
 * Whole-blood donation is typically deferred ~90 days (India: 3 months).
 * This is a *coordination* filter, NOT a medical clearance — final eligibility
 * is always determined by the donation facility.
 */
export function roughlyEligibleByInterval(lastDonationIso?: string): boolean {
  if (!lastDonationIso) return true;
  const last = Date.parse(lastDonationIso);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= 90 * 24 * 60 * 60 * 1000;
}

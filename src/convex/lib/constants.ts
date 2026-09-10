import { v } from "convex/values";

export const APP_NAME = "PranSetu";
export const APP_TAGLINE = "The Bridge for Life";
export const APP_POSITIONING = "Intelligent emergency blood coordination";
export const APP_NAME_DEVANAGARI = "प्राणसेतु";

export const BLOOD_GROUPS = [
  "O+",
  "O-",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const bloodGroupValidator = v.union(
  ...BLOOD_GROUPS.map((g) => v.literal(g)),
);

export const URGENCIES = ["routine", "urgent", "critical"] as const;
export const urgencyValidator = v.union(...URGENCIES.map((u) => v.literal(u)));

/** Which donors can give to a recipient, treating Rh as +/- only. */
export const COMPATIBILITY: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

/** Emergency requests expire after this many hours unless fulfilled. */
export const REQUEST_TTL_HOURS = 24;

/** Progressive radius rings (km) for donor search. */
export const SEARCH_RADII_KM = [5, 10, 25, 50] as const;
export const MAX_DONOR_CANDIDATES = 30;

/** Notification batching: donors notified per radius ring, per wave. */
export const NOTIFY_BATCH_SIZE = 10;
/** Minutes between progressive radius expansion waves (cron-driven). */
export const NOTIFY_WAVE_MINUTES = 20;
/** Duplicate-request window (minutes) for the same requester+group+hospital. */
export const DUPLICATE_WINDOW_MINUTES = 30;
/** Auto-verify after this many minutes without admin review (balance: never block a real emergency). */
export const AUTO_VERIFY_MINUTES = 30;


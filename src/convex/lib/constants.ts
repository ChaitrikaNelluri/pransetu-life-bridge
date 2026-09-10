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


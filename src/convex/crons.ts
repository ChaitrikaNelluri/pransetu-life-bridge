import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Expire overdue emergency requests every 10 minutes.
crons.interval(
  "expire overdue emergency requests",
  { minutes: 10 },
  internal.requests.expireOverdue,
  {},
);

// Progressive radius expansion waves every 20 minutes (NOTIFY_WAVE_MINUTES).
crons.interval(
  "progressive radius expansion waves",
  { minutes: 20 },
  internal.requests.expandWaves,
  {},
);

// Auto-activate submitted requests after the 30-minute grace period.
crons.interval(
  "auto-verify pending requests",
  { minutes: 10 },
  internal.requests.autoVerifyPending,
  {},
);

export default crons;

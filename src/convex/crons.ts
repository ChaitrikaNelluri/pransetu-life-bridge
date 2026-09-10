import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Expire overdue emergency requests every 10 minutes. Reliability note: this
// is the BullMQ "scheduled jobs" equivalent in Convex — a server-side timer
// that keeps the lifecycle honest even if nobody is watching the UI.
crons.interval(
  "expire overdue emergency requests",
  { minutes: 10 },
  internal.requests.expireOverdue,
  {},
);

export default crons;

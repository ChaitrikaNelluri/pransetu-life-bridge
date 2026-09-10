# 🩸 PranSetu — प्राणसेतु

> **Prāṇa** (life) + **Setu** (bridge) — *The Bridge for Life*

PranSetu is an **emergency blood coordination platform**: it connects a
requester at a hospital with compatible, nearby, available donors and verified
blood banks — with an explainable match engine, a server-enforced request
lifecycle, privacy-aware location handling, and an auditable admin trail.

It is a **coordination platform, not a medical service**. It never decides
medical eligibility, never claims blood availability, and never publishes an
exact donor location.

---

## What it does

```
Emergency need
      ↓
Request filed (group · units · urgency · hospital · required-by)
      ↓
Verification  (coordinator/admin review, auto-verified after a grace window
               so a real emergency is never blocked)
      ↓
Candidate discovery   (bounding-box prefilter → exact haversine — the
      ↓                PostGIS two-phase strategy, executed on Convex)
Progressive radius rings 5 → 10 → 25 → 50 km, batched notification waves
      ↓
Explainable ranking (compatibility 40 · availability 20 · distance 25 ·
      ↓              reliability 10 · freshness 5 = 0–100 score + reasons)
Donor accepts → per-unit fulfilment → PARTIALLY_FULFILLED → FULFILLED → CLOSED
      ↓
Everything audited · expired by cron · visible on the live map
```

### v1 roles (sign-in required for everything)

| Role | Experience |
|---|---|
| **Donor** | Onboarding (blood group + ~1 km-precision location), availability toggle, nearby & compatible emergency feed, one-tap respond |
| **Requester** | Emergency filing, live response tracking, per-unit fulfilment, cancel/close, report abuse |
| **Blood bank** | Registry, inventory ledger with per-group freshness labels (Fresh / Aging / Stale), request responses (available / partial / unavailable), public directory |
| **Hospital coordinator** | Registers an org, files and verifies emergencies in their flow |
| **Admin (Archivist)** | Verification queue, org verification, user suspend/restore, reports queue, active-emergency monitor, system health, append-only audit ledger |

---

## Architecture

**Modular monolith on Convex** (the approved stack adapted to this
environment — same separation of concerns as the NestJS baseline):

| Concern | NestJS baseline | This implementation |
|---|---|---|
| API + business logic | Nest modules | `src/convex/*` modules (users, donors, requests, organizations, notifications, admin, reports, maps, system) |
| PostgreSQL + PostGIS | Postgres + PostGIS types/indexes | Convex document store + two-phase geo search (`lib/geo.ts`: indexed bounding-box prefilter, then exact haversine) |
| BullMQ scheduled jobs | Redis-backed workers | Convex crons (`crons.ts`): expiry sweep every 10 min, notification waves every 20 min, verification grace auto-activation |
| Socket.IO realtime | WS event bus | Convex reactive queries — the UI subscribes directly; a socket drop can never desync state |
| FCM / SMS / email adapters | Provider adapters | `lib/events.ts` `notify()` — in-app notification ledger with dedup window; provider adapters are the extension point |
| JWT + refresh tokens | Argon2 + rotation | Convex Auth (email OTP, httpOnly session cookies, server-side `requireUser`/RBAC on every function) |
| Google Maps | Maps Platform | `maps.ts` server-side geocoding action — cached in `geocodeCache`, `GOOGLE_MAPS_API_KEY`-gated, deterministic gazetteer fallback; map page uses the Embed API via `VITE_GOOGLE_MAPS_API_KEY` or renders an offline SVG survey chart |

### Frontend

React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui, themed as a
**vintage archival ledger**: aged-paper oklch palette, oxblood wax-seal
primary, Playfair/Lora/Courier Prime serif hierarchy, rubber-stamp status
markers, double-ruled "folio" cards.

### Safety & privacy invariants

- Donor coordinates are rounded to **~1 km** before storage; the map shows
  approximations, never addresses.
- Patient references are initials only; donor phone numbers are revealed
  **only** to the requester on a response.
- The 90-day donation interval is a **coordination filter, not a medical
  clearance** — the facility screens every donor.
- Blood inventory carries its last-updated time and a freshness label; stale
  stock is never presented as live availability.
- Verified state transitions only (`lib/stateMachine.ts`); CLOSED cannot
  resurrect. Terminal-state fulfilment attempts throw.
- Suspension blocks sign-in actions everywhere via RBAC; every admin action is
  audited; audit writes can never block the user-facing flow.

---

## Repository layout

```
src/
  convex/
    schema.ts              # users, donorProfiles, organizations, inventory,
    requests.ts            #   emergencyRequests, responses, notifications,
    donors.ts              #   reports, auditLogs, geocodeCache + indexes
    organizations.ts
    notifications.ts
    admin.ts
    reports.ts
    maps.ts
    system.ts              # health + map pins
    crons.ts               # expiry · notify waves · verification grace
    lib/
      stateMachine.ts      # validated lifecycle (unit-tested)
      matching.ts          # explainable 0–100 score (unit-tested)
      compatibility.ts     # Rh/ABO table + 90-day interval (unit-tested)
      geo.ts               # haversine + bounding box (unit-tested)
      rbac.ts              # requireUser / requireRole / suspension
      events.ts            # notify (deduped) + audit
      constants.ts         # radii, batch sizes, TTLs, windows
  pages/                   # Landing, Auth, Onboarding, Dashboard, Requests*,
  components/              #   BloodBanks, Org, MapView, Profile, Admin, 404
tests/unit.test.ts         # state machine · compatibility · geo · matching
```

## Getting started

```bash
bun install
bun convex dev --once   # push functions + regenerate types
bun tsc -b --noEmit     # typecheck
bun test tests/         # unit tests (state machine, compatibility, geo, matching)
bun run dev             # start the app
```

### Environment

| Variable | Purpose | Required? |
|---|---|---|
| `VITE_CONVEX_URL` | Convex deployment URL | Set by the platform |
| `GOOGLE_MAPS_API_KEY` | Server-side geocoding (Geocoding API) | Optional — falls back to the built-in gazetteer |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps Embed API for the live map page | Optional — falls back to the SVG survey chart |

No key is needed to run the full workflow. Without Maps keys the geocoder
answers from a deterministic city gazetteer and the map page renders its
offline chart — candidate discovery and matching never touch Maps.

### Demo path (no seed data required)

1. Open `/` — the landing page explains the workflow and links into auth.
2. Sign in on `/auth` (email OTP). Complete onboarding: pick a role.
3. **Requester**: file an emergency (O−, 2 units, critical, city hospital).
   It enters `SUBMITTED`; a coordinator/admin (or the 30-minute grace cron)
   activates it; nearby donors are notified in batched waves.
4. **Second account, donor role**: set yourself available near the hospital —
   the request appears in your feed; respond *I can help*.
5. The requester sees the response live, records units fulfilled
   (`PARTIALLY_FULFILLED` → `FULFILLED`), then closes the request.
6. **Admin**: the case, its audit entries, and the reports/verification queues
   are all on `/admin`; the finished chart is on `/map`.

### Testing

`bun test tests/` — 41 unit tests covering:

- the request state machine (happy path, fast paths, terminal locks,
  cancellation/expiry windows, fulfilment arithmetic, idempotence)
- the ABO/Rh compatibility table (universal donor/recipient, direction
  checks, cross-type blocks) and the 90-day interval guard
- geo math (haversine accuracy/symmetry, bounding-box prefilter soundness)
- the matching score (weights, explainability strings, distance decay,
  reliability, determinism, 100-point ceiling)

## Known limits (by design, v1)

- Notifications are in-app with a dedup window; push/SMS/email provider
  adapters are the documented extension point (`lib/events.ts`).
- No seed script — demo data is created through the real onboarding flow.
- AI/ML deferred deliberately: the deterministic, explainable matcher covers
  v1; the response-history feed is the future training signal.

## Roadmap

FCM/SMS adapters → verified-requester attestation upgrades → demand
forecasting by group/city → blood-bank inventory integrations → PWA offline
donor feed.

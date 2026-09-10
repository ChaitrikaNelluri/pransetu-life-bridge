import { Link } from "react-router";
import { motion } from "framer-motion";
import { ArrowRight, Droplets, ShieldCheck, BellRing, MapPin } from "lucide-react";
import {
  APP_NAME,
  APP_NAME_DEVANAGARI,
  APP_TAGLINE,
} from "@/convex/lib/constants";
import { BLOOD_GROUPS } from "@/convex/lib/constants";
import { PranSetuMark } from "@/components/PranSetuMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

const STEPS = [
  {
    icon: ShieldCheck,
    title: "File the emergency",
    body: "A requester or hospital coordinator records what is needed: blood group, units, urgency, and the hospital location.",
  },
  {
    icon: MapPin,
    title: "Nearby candidates are ranked",
    body: "The matching engine searches outward in rings — 5, 10, 25, 50 km — and scores donors on compatibility, availability, distance and reliability. Every score shows its reasoning.",
  },
  {
    icon: BellRing,
    title: "Donors are notified",
    body: "Ranked candidates receive notifications through the in-app ledger. The requester watches responses arrive in real time.",
  },
  {
    icon: Droplets,
    title: "Coordination to fulfilment",
    body: "A donor accepts, units are recorded, and the request is marked fulfilled — or it simply expires after 24 hours. Final eligibility always rests with the donation facility.",
  },
];

const ROLES = [
  {
    name: "Donor",
    body: "Register your blood group, set availability, and answer nearby emergencies when you choose to.",
  },
  {
    name: "Requester",
    body: "File an emergency in under a minute and track every response as it happens.",
  },
  {
    name: "Blood Bank",
    body: "Maintain a public inventory ledger and answer requests for specific units.",
  },
  {
    name: "Hospital Coordinator",
    body: "Verify emergencies and coordinate cases on behalf of your institution.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen"
    >
      {/* Header */}
      <header className="border-b border-border/70 bg-card/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <PranSetuMark className="size-8 text-primary" />
            <span className="font-serif text-lg font-bold tracking-tight">
              {APP_NAME}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {APP_NAME_DEVANAGARI}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  Open your desk <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth">Register</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="paper-texture border-b border-border/70">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center md:py-28">
          <p className="stamp text-muted-foreground">
            Established for every emergency · Est. MMXXVI
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-4xl font-black leading-tight tracking-tight md:text-6xl">
            The bridge between
            <span className="text-primary"> need </span>
            and life.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {APP_NAME} is an intelligent emergency blood coordination platform.
            When minutes matter, it finds compatible, available donors and blood
            banks near the hospital — and puts the request in front of them in
            seconds.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link to="/auth">
                File an emergency request
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="gap-2">
              <Link to="/auth">
                Register as a donor
                <Droplets className="size-4" />
              </Link>
            </Button>
          </div>

          {/* archival blood-group strip */}
          <div className="mx-auto mt-12 flex max-w-xl flex-wrap items-center justify-center gap-2">
            <span className="stamp mr-1 text-muted-foreground">
              All groups ·
            </span>
            {BLOOD_GROUPS.map((g) => (
              <span
                key={g}
                className="rounded-sm border border-border bg-card px-2 py-1 font-mono text-xs font-bold text-foreground/80"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="text-center">
          <p className="stamp text-muted-foreground">The record of a rescue</p>
          <h2 className="mt-2 font-serif text-3xl font-bold md:text-4xl">
            How {APP_NAME} works
          </h2>
          <div className="mx-auto mt-4 h-px w-24 bg-primary/40" />
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="plate relative rounded-md bg-card p-6"
            >
              <span className="absolute -top-3 left-5 stamp rounded-sm border border-border bg-background px-2 text-muted-foreground">
                Folio {["I", "II", "III", "IV"][i]}
              </span>
              <step.icon className="size-7 text-primary" strokeWidth={1.75} />
              <h3 className="mt-4 font-serif text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className="border-y border-border/70 bg-secondary/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <p className="stamp text-muted-foreground">The registry</p>
            <h2 className="mt-2 font-serif text-3xl font-bold md:text-4xl">
              Five ways to serve
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => (
              <div
                key={role.name}
                className="rounded-md border border-border/70 bg-card p-6"
              >
                <h3 className="smallcaps text-lg font-bold text-primary">
                  {role.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {role.body}
                </p>
              </div>
            ))}
            <div className="rounded-md border border-dashed border-border/70 bg-card/50 p-6">
              <h3 className="smallcaps text-lg font-bold text-muted-foreground">
                Archivist
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Verifies organizations, watches active emergencies, and keeps
                the audit ledger.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Emergency notice */}
      <section className="mx-auto max-w-4xl px-4 py-16">
        <div className="plate rounded-md bg-card p-8 text-center">
          <p className="stamp-seal mx-auto text-destructive">
            Notice — Read First
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {APP_NAME} coordinates people and information. It is not a hospital,
            a blood bank, or a substitute for emergency medical services. If a
            life is in danger, call your local emergency number first. Potential
            donors are identified from profile information alone — final
            eligibility is always determined by the authorized donation
            facility.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="paper-texture border-t border-border/70">
        <div className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h2 className="font-serif text-3xl font-bold md:text-4xl">
            Someone nearby is waiting.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Join the bridge — as a donor who answers, a family that asks, or an
            institution that coordinates.
          </p>
          <Button asChild size="lg" className="mt-8 gap-2">
            <Link to="/auth">
              Enter the registry <ArrowRight className="size-4" />
            </Link>
          </Button>
          <p className="mt-6 font-serif text-lg italic text-muted-foreground">
            {APP_TAGLINE} — प्राणसेतु
          </p>
        </div>
      </section>

      <footer className="border-t border-border/70 py-6 text-center">
        <p className="stamp text-muted-foreground">
          {APP_NAME} — The Bridge for Life · MMXXVI
        </p>
      </footer>
    </motion.div>
  );
}

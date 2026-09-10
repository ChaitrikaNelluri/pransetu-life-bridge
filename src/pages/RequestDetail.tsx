import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { BloodGroupChip, StatusStamp } from "@/components/vintage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  Building2,
  Check,
  Droplets,
  Flag,
  HandHeart,
  MapPin,
  ScrollText,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, timeAgo, hoursUntil } from "@/lib/format";

const OPEN_STATUSES = [
  "SUBMITTED",
  "VERIFICATION_PENDING",
  "ACTIVE",
  "DONOR_CONTACTED",
  "DONOR_ACCEPTED",
  "PARTIALLY_FULFILLED",
];

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [note, setNote] = useState("");
  const [responding, setResponding] = useState(false);

  const request = useQuery(
    api.requests.get,
    id ? { id: id as never } : "skip",
  );
  const responses = useQuery(
    api.requests.responses,
    id ? { requestId: id as never } : "skip",
  );
  const matches = useQuery(
    api.requests.matches,
    id ? { requestId: id as never } : "skip",
  );
  const donorProfile = useQuery(
    api.donors.myProfile,
    user?.role === "donor" ? {} : "skip",
  );

  const respond = useMutation(api.requests.respond);
  const decline = useMutation(api.requests.decline);
  const cancel = useMutation(api.requests.cancel);
  const close = useMutation(api.requests.close);
  const markFulfilled = useMutation(api.requests.markFulfilled);
  const verify = useMutation(api.requests.verify);
  const fileReport = useMutation(api.reports.file);

  if (request === undefined) {
    return (
      <AppShell>
        <p className="py-16 text-center text-muted-foreground">
          Opening the folio…
        </p>
      </AppShell>
    );
  }
  if (request === null) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-md text-center">
          <CardContent className="pt-6">
            <p className="font-serif text-xl font-bold">Request not found</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/requests">Back to the ledger</Link>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const isOwner = user?._id === request.requesterId;
  const isDonor = user?.role === "donor";
  const isCoordinator = user?.role === "hospital" || user?.role === "admin";
  const isOpen = OPEN_STATUSES.includes(request.status);
  const myOffer = (responses ?? []).find(
    (r) => r.responderId === user?._id && r.status !== "declined",
  );
  const canRespond = isDonor && donorProfile && isOpen && !myOffer;
  const activeResponses = (responses ?? []).filter(
    (r) => r.status !== "declined",
  );

  const doRespond = async () => {
    if (!id) return;
    setResponding(true);
    try {
      await respond({
        requestId: id as never,
        note: note.trim() || undefined,
      });
      toast.success("Response recorded. The requester can now reach you.");
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not respond.");
    } finally {
      setResponding(false);
    }
  };

  const hours = hoursUntil(request.requiredBy);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center gap-2">
          <Link
            to="/requests"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Emergencies
          </Link>
          {isOpen && !isOwner && (
            <button
              type="button"
              onClick={() =>
                fileReport({ requestId: id as never, category: "FAKE_REQUEST" })
                  .then(() => toast.success("Report filed for archivist review."))
                  .catch(() => toast.error("Could not file report."))
              }
              className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
            >
              <Flag className="size-3" /> Report this folio
            </button>
          )}
        </div>

        {/* Header */}
        <div>
          <p className="stamp text-muted-foreground">Emergency Folio</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <BloodGroupChip group={request.bloodGroup} className="text-base" />
            <h1 className="font-serif text-3xl font-bold">
              {request.hospitalName}
            </h1>
            <StatusStamp value={request.status} />
            <StatusStamp value={request.urgency} />
            {request.verificationStatus === "verified" && (
              <span className="stamp text-chart-3">✓ verified</span>
            )}
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {request.city}
            </span>
            <span>
              {request.unitsFulfilled}/{request.unitsRequired} units fulfilled
            </span>
            <span>
              {hours >= 0
                ? `needed within ${hours}h`
                : "past its required-by time"}
            </span>
            {request.radiusKm && <span>search ring: {request.radiusKm} km</span>}
          </p>
        </div>

        {request.status === "EXPIRED" && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertTriangle className="size-5 text-destructive" />
              <p className="text-sm text-muted-foreground">
                This request expired unfulfilled after 24 hours. File a fresh
                request if the need remains.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Verification panel for coordinators/admins */}
        {request.status === "SUBMITTED" && isCoordinator && (
          <Card className="plate border-chart-4/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <ScrollText className="size-5 text-chart-4" /> Verification
                review
              </CardTitle>
              <CardDescription>
                Confirm by phone or hospital record, then approve or reject.
                Unreviewed filings auto-activate after 30 minutes so genuine
                emergencies are never blocked.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button
                className="gap-2"
                onClick={() =>
                  verify({ requestId: id as never, approve: true })
                    .then(() =>
                      toast.success("Request approved and donors notified."),
                    )
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Failed."),
                    )
                }
              >
                <Check className="size-4" /> Approve & notify donors
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() =>
                  verify({ requestId: id as never, approve: false })
                    .then(() => toast.success("Request rejected."))
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Failed."),
                    )
                }
              >
                <X className="size-4" /> Reject
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Details */}
        <Card className="plate">
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-lg">The record</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="smallcaps text-muted-foreground">Patient</p>
              <p className="mt-0.5 font-medium">{request.patientRef}</p>
            </div>
            <div>
              <p className="smallcaps text-muted-foreground">Contact</p>
              <p className="mt-0.5 font-mono">
                {isOwner || isCoordinator
                  ? request.contactPhone
                  : "••••• (shared when you respond)"}
              </p>
            </div>
            <div>
              <p className="smallcaps text-muted-foreground">Needed by</p>
              <p className="mt-0.5">{formatDateTime(request.requiredBy)}</p>
            </div>
            <div>
              <p className="smallcaps text-muted-foreground">Filed</p>
              <p className="mt-0.5">{timeAgo(request._creationTime)}</p>
            </div>
            {request.description && (
              <div className="sm:col-span-2">
                <p className="smallcaps text-muted-foreground">Notes</p>
                <p className="mt-0.5">{request.description}</p>
              </div>
            )}
            <div className="sm:col-span-2 rounded-sm border border-border/60 bg-muted/50 p-3 text-xs text-muted-foreground">
              Potential donors are identified from profile information alone.
              Final donation eligibility and blood compatibility must be
              confirmed by the authorized blood-donation facility — not by
              PranSetu.
            </div>
          </CardContent>
        </Card>

        {/* Donor response panel */}
        {canRespond && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <HandHeart className="size-5 text-primary" /> Can you help?
              </CardTitle>
              <CardDescription>
                Your response shares your contact number with the requester.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rd-note">
                  Note <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="rd-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. I can be at the hospital by 6pm."
                />
              </div>
              <Button onClick={doRespond} disabled={responding} className="gap-2">
                <Droplets className="size-4" />
                {responding ? "Recording…" : "I can donate"}
              </Button>
            </CardContent>
          </Card>
        )}
        {isDonor && myOffer && isOpen && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
              <span>
                You have offered help on this folio. The requester will contact
                you on your profile number.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  decline({ requestId: id as never })
                    .then(() => toast.success("Offer withdrawn."))
                    .catch(() => toast.error("Failed."))
                }
              >
                Withdraw offer
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Responses */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="font-serif text-lg">
              Responses ({activeResponses.length})
            </CardTitle>
            <CardDescription>
              Donors and blood banks who have answered this folio.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeResponses.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">
                No responses yet. Nearby compatible donors have been notified
                and will appear here as they answer.
              </p>
            ) : (
              <div className="space-y-2">
                {activeResponses.map((r) => (
                  <div
                    key={r._id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/70 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      {r.kind === "donor" ? (
                        <UserRound className="size-4 text-primary" />
                      ) : (
                        <Building2 className="size-4 text-chart-5" />
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {r.kind === "donor" ? "Donor" : "Blood bank"}
                          {r.units ? ` · ${r.units} units` : ""}
                        </p>
                        {r.note && (
                          <p className="text-xs text-muted-foreground">
                            “{r.note}”
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isOwner && r.contactPhone && (
                        <a
                          href={`tel:${r.contactPhone}`}
                          className="font-mono text-sm text-primary underline"
                        >
                          {r.contactPhone}
                        </a>
                      )}
                      <span className="stamp text-muted-foreground">
                        {timeAgo(r.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Explainable match sheet */}
        {(matches ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-lg">
                Ranked candidates (match sheet)
              </CardTitle>
              <CardDescription>
                Deterministic, explainable ranking — compatibility, availability,
                distance, reliability. Never a medical eligibility decision.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(matches ?? []).slice(0, 8).map((m, i) => (
                <div
                  key={m.userId}
                  className="rounded-sm border border-border/70 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">
                      #{i + 1} · {m.bloodGroup} donor ·{" "}
                      {m.distanceKm.toFixed(1)} km
                    </p>
                    <span className="font-mono text-sm font-bold text-primary">
                      {m.score}
                    </span>
                  </div>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {m.reasons.map((reason: string) => (
                      <li
                        key={reason}
                        className="rounded-sm bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"
                      >
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Owner actions */}
        {isOwner && (isOpen || request.status === "FULFILLED") && (
          <Card>
            <CardContent className="flex flex-wrap gap-3 pt-6">
              {request.unitsFulfilled < request.unitsRequired && (
                <Button
                  className="gap-2"
                  onClick={() =>
                    markFulfilled({ requestId: id as never })
                      .then((res) =>
                        toast.success(
                          res.done ? "Request fully fulfilled!" : "Unit recorded.",
                        ),
                      )
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : "Failed."),
                      )
                  }
                >
                  <Droplets className="size-4" /> Record a unit received
                </Button>
              )}
              {request.status === "FULFILLED" && (
                <Button
                  className="gap-2"
                  onClick={() =>
                    close({ requestId: id as never })
                      .then(() => toast.success("Folio closed."))
                      .catch((e) =>
                        toast.error(e instanceof Error ? e.message : "Failed."),
                      )
                  }
                >
                  <Check className="size-4" /> Close the folio
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  cancel({ requestId: id as never })
                    .then(() => toast.success("Request cancelled."))
                    .catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Failed."),
                    )
                }
              >
                Cancel request
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

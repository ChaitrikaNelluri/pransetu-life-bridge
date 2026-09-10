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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Building2,
  Droplets,
  HandHeart,
  MapPin,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  formatDateTime,
  timeAgo,
  hoursUntil,
} from "@/lib/format";

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
  const donorProfile = useQuery(
    api.donors.myProfile,
    user?.role === "donor" ? {} : "skip",
  );

  const respond = useMutation(api.requests.respond);
  const cancel = useMutation(api.requests.cancel);
  const markFulfilled = useMutation(api.requests.markFulfilled);

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
  const canRespond =
    isDonor &&
    donorProfile &&
    ["ACTIVE", "SUBMITTED"].includes(request.status) &&
    !(responses ?? []).some(
      (r) => r.responderId === user?._id && r.status !== "declined",
    );

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
          <Link to="/requests" className="text-sm text-muted-foreground hover:text-foreground">
            ← Emergencies
          </Link>
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
            {request.verificationStatus === "verified" && (
              <span className="text-chart-3">✓ verified</span>
            )}
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
              <p className="mt-0.5 font-mono">{request.contactPhone}</p>
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
              Final medical eligibility is always determined by the authorized
              donation facility — not by PranSetu.
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
        {isDonor && donorProfile && !canRespond && ["ACTIVE", "SUBMITTED"].includes(request.status) && (responses ?? []).some((r) => r.responderId === user?._id) && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 text-sm">
              You have offered help on this folio. The requester will contact
              you on the number on your profile.
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

        {/* Owner actions */}
        {isOwner && ["SUBMITTED", "ACTIVE", "DONOR_ACCEPTED"].includes(request.status) && (
          <Card>
            <CardContent className="flex flex-wrap gap-3 pt-6">
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Droplets className="size-4" /> Mark units received
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-serif">
                      Record units received
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    {request.unitsFulfilled < request.unitsRequired ? (
                      <Button
                        className="w-full"
                        onClick={async () => {
                          try {
                            await markFulfilled({ requestId: id as never });
                            toast.success("Unit recorded against this folio.");
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Failed.",
                            );
                          }
                        }}
                      >
                        Record 1 unit received
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        All units are already fulfilled.
                      </p>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await cancel({ requestId: id as never });
                    toast.success("Request cancelled.");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed.");
                  }
                }}
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

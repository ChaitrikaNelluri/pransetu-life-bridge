import { Link } from "react-router";
import { useQuery } from "convex/react";
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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import {
  Droplets,
  MapPin,
  ShieldCheck,
  Siren,
  Building2,
} from "lucide-react";
import { timeAgo, hoursUntil } from "@/lib/format";

function UrgentNotice({
  requests,
}: {
  requests: NonNullable<
    ReturnType<typeof useQuery<typeof api.requests.activeNearby>>
  >;
}) {
  if (requests.length === 0) return null;
  return (
    <Card className="plate border-destructive/40">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 font-serif text-lg text-destructive">
          <Siren className="size-5" /> Active emergencies near you
        </CardTitle>
        <CardDescription>
          Live within the last day — respond if you are able.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.slice(0, 3).map((r) => (
          <Link
            key={r._id}
            to={`/requests/${r._id}`}
            className="flex items-center justify-between gap-3 rounded-sm border border-border/70 bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BloodGroupChip group={r.bloodGroup} />
                <span className="text-sm font-semibold">{r.hospitalName}</span>
                <StatusStamp value={r.urgency} />
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {r.city} · {r.unitsRequired - r.unitsFulfilled} unit
                {r.unitsRequired - r.unitsFulfilled === 1 ? "" : "s"} needed ·{" "}
                {hoursUntil(r.requiredBy) >= 0
                  ? `required within ${hoursUntil(r.requiredBy)}h`
                  : "overdue"}
              </p>
            </div>
            <span className="stamp shrink-0 text-muted-foreground">
              {timeAgo(r._creationTime)}
            </span>
          </Link>
        ))}
        {requests.length > 3 && (
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/requests" className="underline">
              See all {requests.length} active emergencies
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;

  const donorProfile = useQuery(
    api.donors.myProfile,
    role === "donor" ? {} : "skip",
  );
  const activeNearby = useQuery(
    api.requests.activeNearby,
    role === "donor" && donorProfile
      ? { lat: donorProfile.lat, lng: donorProfile.lng }
      : "skip",
  );
  const myResponses = useQuery(
    api.donors.myResponses,
    role === "donor" ? {} : "skip",
  );
  const myRequests = useQuery(
    api.requests.mine,
    role === "requester" ? {} : "skip",
  );
  const orgStats = useQuery(
    api.organizations.myInventory,
    role === "blood_bank" ? {} : "skip",
  );
  const adminStats = useQuery(api.admin.stats, role === "admin" ? {} : "skip");

  const setAvailability = useMutation(api.donors.setAvailability);

  if (role === "donor") {
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <p className="stamp text-muted-foreground">Donor's Desk</p>
            <h1 className="mt-1 font-serif text-3xl font-bold">
              {user?.name ?? "Donor"}
            </h1>
          </div>

          {donorProfile && (
            <Card className="plate">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-sm border border-primary/40 bg-primary/10 font-mono text-xl font-bold text-primary">
                    {donorProfile.bloodGroup}
                  </div>
                  <div>
                    <p className="smallcaps text-sm text-muted-foreground">
                      Approximate location
                    </p>
                    <p className="flex items-center gap-1 text-sm font-medium">
                      <MapPin className="size-3.5 text-primary" />
                      {donorProfile.locationLabel}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Label htmlFor="avail" className="text-sm">
                    Available to donate
                  </Label>
                  <Switch
                    id="avail"
                    checked={donorProfile.available}
                    onCheckedChange={(checked) => {
                      setAvailability({ available: checked })
                        .then(() =>
                          toast.success(
                            checked
                              ? "You are marked available."
                              : "You are marked unavailable.",
                          ),
                        )
                        .catch(() => toast.error("Could not update."));
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeNearby !== undefined && (
            <UrgentNotice requests={activeNearby ?? []} />
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-lg">
                Your responses
              </CardTitle>
              <CardDescription>
                History of the emergencies you answered.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(myResponses ?? []).length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">
                  No responses yet. When a compatible emergency is filed within
                  50 km, it will appear above.
                </p>
              ) : (
                <div className="space-y-2">
                  {(myResponses ?? []).map((resp) => (
                    <Link
                      key={resp._id}
                      to={`/requests/${resp.requestId ?? ""}`}
                      className="block rounded-sm border border-border/70 px-3 py-2 text-sm hover:border-primary/40"
                    >
                      <span className="font-medium">
                        {resp.requestSummary ?? "Emergency request"}
                      </span>
                      <span className="ml-2 stamp text-muted-foreground">
                        {resp.status}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (role === "requester") {
    return (
      <AppShell>
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="stamp text-muted-foreground">Requester's Desk</p>
              <h1 className="mt-1 font-serif text-3xl font-bold">
                {user?.name ?? "Requester"}
              </h1>
            </div>
            <Button asChild className="gap-2">
              <Link to="/requests/new">
                <Siren className="size-4" /> File an emergency
              </Link>
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-serif text-lg">
                Your emergency requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(myRequests ?? []).length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    No requests on file yet.
                  </p>
                  <Button asChild variant="outline" className="mt-3">
                    <Link to="/requests/new">File your first request</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {(myRequests ?? []).map((r) => (
                    <Link
                      key={r._id}
                      to={`/requests/${r._id}`}
                      className="flex items-center justify-between gap-3 rounded-sm border border-border/70 px-3 py-2.5 transition-colors hover:border-primary/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <BloodGroupChip group={r.bloodGroup} />
                        <span className="text-sm font-medium">
                          {r.hospitalName}
                        </span>
                        <StatusStamp value={r.status} />
                      </div>
                      <span className="stamp text-muted-foreground">
                        {r.unitsFulfilled}/{r.unitsRequired} units ·{" "}
                        {timeAgo(r._creationTime)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (role === "blood_bank" || role === "hospital") {
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <p className="stamp text-muted-foreground">
              {role === "blood_bank" ? "Blood Bank" : "Coordination"} Desk
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold">
              {user?.name ?? "Organization"}
            </h1>
          </div>
          <Card className="plate">
            <CardHeader>
              <div className="mb-3 flex size-10 items-center justify-center rounded-sm bg-primary/10 text-primary">
                {role === "blood_bank" ? (
                  <Building2 className="size-5" />
                ) : (
                  <ShieldCheck className="size-5" />
                )}
              </div>
              <CardTitle className="font-serif text-lg">
                {role === "blood_bank"
                  ? "Manage your inventory ledger"
                  : "Coordinate emergencies"}
              </CardTitle>
              <CardDescription>
                {role === "blood_bank"
                  ? "Keep unit counts current — stale inventory erodes trust."
                  : "File and verify emergency requests on behalf of your hospital."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {role === "blood_bank" && (
                <Button asChild className="gap-2">
                  <Link to="/org">
                    <Droplets className="size-4" /> Update inventory
                  </Link>
                </Button>
              )}
              {role === "hospital" && (
                <Button asChild className="gap-2">
                  <Link to="/requests/new">
                    <Siren className="size-4" /> File an emergency
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" className="gap-2">
                <Link to="/requests">
                  <Siren className="size-4" /> View active emergencies
                </Link>
              </Button>
            </CardContent>
          </Card>

          {role === "blood_bank" && orgStats && orgStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">
                  Inventory snapshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {orgStats.map((inv) => (
                    <div
                      key={inv.bloodGroup}
                      className="rounded-sm border border-border/70 p-2 text-center"
                    >
                      <p className="font-mono text-sm font-bold">
                        {inv.bloodGroup}
                      </p>
                      <p className="text-lg font-bold text-primary">
                        {inv.units}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </AppShell>
    );
  }

  if (role === "admin") {
    const s = adminStats;
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <p className="stamp text-muted-foreground">Archivist's Ledger</p>
            <h1 className="mt-1 font-serif text-3xl font-bold">
              System overview
            </h1>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Active emergencies", value: s?.activeRequests },
              { label: "Verified organizations", value: s?.verifiedOrgs },
              { label: "Registered donors", value: s?.donors },
            ].map((m) => (
              <Card key={m.label} className="plate">
                <CardContent className="pt-6 text-center">
                  <p className="font-serif text-4xl font-black text-primary">
                    {m.value ?? "—"}
                  </p>
                  <p className="smallcaps mt-1 text-sm text-muted-foreground">
                    {m.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <Button asChild className="gap-2">
            <Link to="/admin">Open the full ledger</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  // Fallback: not onboarded or unknown role
  return (
    <AppShell>
      <Card className="plate mx-auto max-w-lg text-center">
        <CardContent className="pt-6">
          <p className="font-serif text-xl font-bold">Complete your entry</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose your role to activate your place in the registry.
          </p>
          <Button asChild className="mt-4">
            <Link to="/onboarding">Choose a role</Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}

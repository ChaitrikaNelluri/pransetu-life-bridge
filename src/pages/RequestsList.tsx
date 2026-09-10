import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/AppShell";
import { BloodGroupChip, StatusStamp } from "@/components/vintage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Siren } from "lucide-react";
import { timeAgo, hoursUntil } from "@/lib/format";
import { compatibleDonorsFor } from "@/convex/lib/compatibility";
import type { BloodGroup } from "@/convex/lib/constants";

function RequestRow({
  r,
  compatible,
}: {
  r: {
    _id: string;
    bloodGroup: string;
    hospitalName: string;
    city: string;
    urgency: string;
    status: string;
    unitsRequired: number;
    unitsFulfilled: number;
    requiredBy: number;
    _creationTime: number;
  };
  compatible?: boolean;
}) {
  const remaining = r.unitsRequired - r.unitsFulfilled;
  const hours = hoursUntil(r.requiredBy);
  return (
    <Link
      to={`/requests/${r._id}`}
      className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/70 bg-card px-4 py-3 transition-colors hover:border-primary/40"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <BloodGroupChip group={r.bloodGroup} />
          {compatible && (
            <span className="stamp rounded-sm border border-chart-3/60 px-1.5 text-chart-3">
              your type
            </span>
          )}
          <span className="text-sm font-semibold">{r.hospitalName}</span>
          <StatusStamp value={r.urgency} />
          <StatusStamp value={r.status} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {r.city} · {remaining} unit{remaining === 1 ? "" : "s"} needed ·{" "}
          {hours >= 0 ? `required within ${hours}h` : "overdue"}
        </p>
      </div>
      <span className="stamp shrink-0 text-muted-foreground">
        {timeAgo(r._creationTime)}
      </span>
    </Link>
  );
}

export default function RequestsList() {
  const { user } = useAuth();
  const role = user?.role;

  const active = useQuery(api.requests.active);
  const mine = useQuery(api.requests.mine, { });
  const donorProfile = useQuery(
    api.donors.myProfile,
    role === "donor" ? {} : "skip",
  );
  const nearby = useQuery(
    api.requests.activeNearby,
    role === "donor" && donorProfile
      ? { lat: donorProfile.lat, lng: donorProfile.lng }
      : "skip",
  );

  const isRequesterSide =
    role === "requester" || role === "hospital" || role === "admin";

  const compatibleGroups: string[] = donorProfile
    ? compatibleDonorsFor(donorProfile.bloodGroup as BloodGroup)
    : [];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="stamp text-muted-foreground">Emergency Ledger</p>
            <h1 className="mt-1 font-serif text-3xl font-bold">
              Active emergencies
            </h1>
          </div>
          {isRequesterSide && (
            <Button asChild className="gap-2">
              <Link to="/requests/new">
                <Siren className="size-4" /> File an emergency
              </Link>
            </Button>
          )}
        </div>

        <Tabs defaultValue={role === "donor" ? "nearby" : "active"}>
          {role === "donor" && (
            <TabsList>
              <TabsTrigger value="nearby">
                Nearby & compatible
              </TabsTrigger>
              <TabsTrigger value="all">All active</TabsTrigger>
            </TabsList>
          )}

          {role === "donor" ? (
            <>
              <TabsContent value="nearby" className="mt-4">
                {!donorProfile ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      Complete your donor profile to see compatible emergencies
                      near you.
                    </CardContent>
                  </Card>
                ) : (nearby ?? []).length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No active compatible emergencies within 50 km right now.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {(nearby ?? []).map((r) => (
                      <RequestRow
                        key={r._id}
                        r={r}
                        compatible={compatibleGroups.includes(r.bloodGroup)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="all" className="mt-4">
                {(active ?? []).length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No active emergencies on the ledger.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {(active ?? []).map((r) => (
                      <RequestRow
                        key={r._id}
                        r={r}
                        compatible={compatibleGroups.includes(r.bloodGroup)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            </>
          ) : (
            <div className="mt-4 space-y-6">
              <section>
                <h2 className="smallcaps mb-2 text-sm text-muted-foreground">
                  All active emergencies
                </h2>
                {(active ?? []).length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No active emergencies on the ledger.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {(active ?? []).map((r) => (
                      <RequestRow key={r._id} r={r} />
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2 className="smallcaps mb-2 text-sm text-muted-foreground">
                  Filed by you
                </h2>
                {(mine ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    You have not filed any requests yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {(mine ?? []).map((r) => (
                      <RequestRow key={r._id} r={r} />
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </Tabs>
      </div>
    </AppShell>
  );
}

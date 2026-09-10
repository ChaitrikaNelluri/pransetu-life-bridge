import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, MapPin, Phone } from "lucide-react";
import { timeAgo, inventoryConfidence } from "@/lib/format";
import { BLOOD_GROUPS } from "@/convex/lib/constants";
import { StatusStamp } from "@/components/vintage";
import { haversineKm } from "@/convex/lib/geo";
import { useAuth } from "@/hooks/use-auth";

interface InvRow {
  bloodGroup: string;
  units: number;
  updatedAt: number;
}

export default function BloodBanks() {
  const { user } = useAuth();
  const [city, setCity] = useState("all");
  const [group, setGroup] = useState("all");

  const orgs = useQuery(api.organizations.listPublic);
  const donorProfile = useQuery(
    api.donors.myProfile,
    user?.role === "donor" ? {} : "skip",
  );

  const cities = useMemo(() => {
    const set = new Set((orgs ?? []).map((o) => o.city));
    return Array.from(set).sort();
  }, [orgs]);

  const filtered = (orgs ?? []).filter((o) => {
    if (city !== "all" && o.city !== city) return false;
    if (group !== "all") {
      const has = (o.inventory ?? []).some(
        (inv: InvRow) => inv.bloodGroup === group && inv.units > 0,
      );
      if (!has) return false;
    }
    return true;
  });

  const withDistance = filtered.map((o) => ({
    ...o,
    distanceKm:
      donorProfile && o.verificationStatus === "verified"
        ? haversineKm(donorProfile.lat, donorProfile.lng, o.lat, o.lng)
        : null,
  }));
  withDistance.sort((a, b) => {
    if (a.distanceKm == null || b.distanceKm == null) return 0;
    return a.distanceKm - b.distanceKm;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="stamp text-muted-foreground">Directory</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Blood banks</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Verified organizations only. Inventory is a manual ledger — always
            note its age before relying on it, and call ahead where possible.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44 space-y-1">
            <Label>City</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cities</SelectItem>
                {cities.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40 space-y-1">
            <Label>Has group</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any group</SelectItem>
                {BLOOD_GROUPS.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!orgs ? (
          <p className="py-10 text-center text-muted-foreground">Opening…</p>
        ) : withDistance.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No verified blood banks match. Organizations appear here once an
              archivist verifies them.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {withDistance.map((o) => {
              const freshest = Math.max(
                ...(o.inventory ?? [{ updatedAt: 0 }]).map(
                  (i: InvRow) => i.updatedAt,
                ),
                0,
              );
              const conf = freshest ? inventoryConfidence(freshest) : null;
              return (
                <Card key={o._id} className="plate">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 items-center justify-center rounded-sm bg-chart-5/10 text-chart-5">
                          <Building2 className="size-5" />
                        </div>
                        <div>
                          <h3 className="font-serif text-lg font-bold leading-tight">
                            {o.name}
                          </h3>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" /> {o.address}, {o.city}
                          </p>
                        </div>
                      </div>
                      <StatusStamp
                        value={o.verificationStatus}
                        className="shrink-0"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        <span className="font-mono">{o.contactPhone}</span>
                      </span>
                      <span>· {o.operatingHours}</span>
                      {o.distanceKm != null && (
                        <span>
                          · {o.distanceKm.toFixed(1)} km from you
                        </span>
                      )}
                    </div>

                    <div className="mt-4">
                      {(o.inventory ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No inventory on record.
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                          {BLOOD_GROUPS.map((g) => {
                            const inv = (o.inventory ?? []).find(
                              (i: InvRow) => i.bloodGroup === g,
                            );
                            const units = inv?.units ?? 0;
                            return (
                              <div
                                key={g}
                                className={`rounded-sm border px-1 py-1.5 text-center ${
                                  units > 0
                                    ? "border-primary/40 bg-primary/10"
                                    : "border-border/60 bg-muted/30 opacity-60"
                                }`}
                              >
                                <p className="font-mono text-[10px] font-bold">
                                  {g}
                                </p>
                                <p className="text-sm font-bold text-primary">
                                  {units}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {conf && (
                      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge
                          variant={
                            conf.tone === "fresh"
                              ? "secondary"
                              : conf.tone === "aging"
                                ? "outline"
                                : "destructive"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {conf.label}
                        </Badge>
                        ledger updated {timeAgo(freshest)}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusStamp } from "@/components/vintage";
import { toast } from "sonner";
import { Droplets, Loader2, Save } from "lucide-react";
import { BLOOD_GROUPS, type BloodGroup } from "@/convex/lib/constants";
import { timeAgo } from "@/lib/format";

export default function OrgDashboard() {
  const org = useQuery(api.organizations.myOrg);
  const inventory = useQuery(api.organizations.myInventory);
  const saveInventoryUnit = useMutation(api.organizations.setInventoryUnit);

  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Draft per group = explicit edit if any, otherwise the server value.
  const draftOf = (group: string, fallback: number) => edits[group] ?? fallback;
  // Baseline the ledger resets to when a save lands.
  const serverUnits = new Map((inventory ?? []).map((i) => [i.bloodGroup, i.units]));

  const discardEdits = () => setEdits({});

  if (org === undefined) {
    return (
      <AppShell>
        <p className="py-16 text-center text-muted-foreground">Opening…</p>
      </AppShell>
    );
  }
  if (org === null) {
    return (
      <AppShell>
        <Card className="mx-auto max-w-md text-center">
          <CardContent className="pt-6">
            <p className="font-serif text-xl font-bold">
              No organization on file
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Your account is not linked to an organization. Complete onboarding
              as a blood bank or hospital to register one.
            </p>
            <Button asChild className="mt-4">
              <a href="/onboarding">Go to onboarding</a>
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const saveUnit = async (group: BloodGroup) => {
    setSaving(group);
    try {
      await saveInventoryUnit({
        bloodGroup: group,
        units: Math.max(0, Math.floor(draftOf(group, 0))),
      });
      setEdits((e) => {
        const next = { ...e };
        delete next[group];
        return next;
      });
      toast.success(`${group} ledger updated.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="stamp text-muted-foreground">Organization Registry</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-bold">{org.name}</h1>
            <StatusStamp value={org.verificationStatus} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {org.type === "blood_bank" ? "Blood bank" : "Hospital"} ·{" "}
            {org.address}, {org.city} · {org.operatingHours}
          </p>
          {org.verificationStatus === "pending" && (
            <p className="mt-2 text-sm text-chart-4">
              An archivist is reviewing your organization. You can maintain your
              ledger now; public visibility begins after verification.
            </p>
          )}
        </div>

        {Object.keys(edits).length > 0 && (
          <div className="flex items-center justify-between rounded-sm border border-chart-4/50 bg-chart-4/5 px-3 py-2 text-sm">
            <span>
              Unsaved edits to {Object.keys(edits).length} group
              {Object.keys(edits).length === 1 ? "" : "s"}.
            </span>
            <Button size="sm" variant="ghost" onClick={discardEdits}>
              Discard
            </Button>
          </div>
        )}

        {org.type === "blood_bank" ? (
          <Card className="plate">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 font-serif text-lg">
                <Droplets className="size-5 text-primary" /> Inventory ledger
              </CardTitle>
              <CardDescription>
                Set whole units available per group. Every save stamps the
                ledger with a fresh timestamp — the public directory shows this
                age as inventory confidence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {BLOOD_GROUPS.map((g) => {
                  const inv = (inventory ?? []).find((i) => i.bloodGroup === g);
                  return (
                    <div key={g} className="rounded-sm border border-border/70 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm font-bold">{g}</span>
                        {inv && (
                          <span className="text-[10px] text-muted-foreground">
                            {timeAgo(inv.updatedAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Input
                          type="number"
                          min={0}
                          max={999}
                          value={draftOf(g, serverUnits.get(g) ?? 0)}
                          onChange={(e) =>
                            setEdits((u) => ({
                              ...u,
                              [g]: Number(e.target.value),
                            }))
                          }
                          className="h-8"
                          aria-label={`${g} units`}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveUnit(g)}
                          disabled={saving === g}
                          className="size-8 shrink-0 p-0"
                          aria-label={`Save ${g}`}
                        >
                          {saving === g ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="plate">
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Hospital coordination
              </CardTitle>
              <CardDescription>
                File and verify emergencies from the Emergencies page. Your
                institution's filings carry a coordinator signature once
                verified.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

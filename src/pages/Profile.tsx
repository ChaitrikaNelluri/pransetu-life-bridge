import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { LocationPicker, type LocationValue } from "@/components/LocationPicker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatusStamp } from "@/components/vintage";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { BLOOD_GROUPS, type BloodGroup } from "@/convex/lib/constants";
import { useAuth } from "@/hooks/use-auth";

export default function Profile() {
  const { user } = useAuth();
  const donorProfile = useQuery(
    api.donors.myProfile,
    user?.role === "donor" ? {} : "skip",
  );
  const org = useQuery(
    api.organizations.myOrg,
    user?.role === "blood_bank" || user?.role === "hospital" ? {} : "skip",
  );
  const updateProfile = useMutation(api.donors.updateProfile);

  // Edit overrides over the server record — no effect-driven state mirroring.
  const [edits, setEdits] = useState<{
    bloodGroup?: BloodGroup;
    available?: boolean;
    location?: LocationValue | null;
    lastDonation?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  const bloodGroup = edits.bloodGroup ?? donorProfile?.bloodGroup ?? "";
  const available = edits.available ?? donorProfile?.available ?? true;
  const location =
    edits.location !== undefined
      ? edits.location
      : donorProfile
        ? {
            label: donorProfile.locationLabel,
            city: "",
            lat: donorProfile.lat,
            lng: donorProfile.lng,
          }
        : null;
  const lastDonation =
    edits.lastDonation ?? donorProfile?.lastDonationDate ?? "";

  const save = async () => {
    setSaving(true);
    try {
      await updateProfile({
        bloodGroup: bloodGroup ? (bloodGroup as BloodGroup) : undefined,
        available,
        lat: location?.lat,
        lng: location?.lng,
        locationLabel: location?.label,
        lastDonationDate: lastDonation || null,
      });
      setEdits({});
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="stamp text-muted-foreground">Registry Entry</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">
            {user?.name ?? "Profile"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.email ?? ""}
          </p>
        </div>

        {user?.role === "donor" && donorProfile && (
          <Card className="plate">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-lg">
                  Donor record
                </CardTitle>
                <StatusStamp value={donorProfile.verificationStatus} />
              </div>
              <CardDescription>
                Keep your availability honest — it is the single most valuable
                thing you maintain here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Blood group</Label>
                  <Select
                    value={bloodGroup}
                    onValueChange={(v) =>
                      setEdits((e) => ({ ...e, bloodGroup: v as BloodGroup }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BLOOD_GROUPS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {g}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pf-lastdon">Last donation</Label>
                  <Input
                    id="pf-lastdon"
                    type="date"
                    value={lastDonation}
                    onChange={(e) =>
                      setEdits((ed) => ({ ...ed, lastDonation: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Used only as a 90-day interval guard — not a medical record.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-sm border border-border/70 p-3">
                <div>
                  <Label htmlFor="pf-avail" className="text-sm font-medium">
                    Available to donate
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Unavailable donors are never matched or notified.
                  </p>
                </div>
                <Switch
                  id="pf-avail"
                  checked={available}
                  onCheckedChange={(v) => setEdits((e) => ({ ...e, available: v }))}
                />
              </div>

              <div>
                <Label>Approximate location</Label>
                <div className="mt-2">
                  <LocationPicker
                    value={location}
                    onChange={(v) => setEdits((e) => ({ ...e, location: v }))}
                    idPrefix="pf"
                  />
                </div>
              </div>

              <Button onClick={save} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save changes
              </Button>
            </CardContent>
          </Card>
        )}

        {user?.role === "donor" && !donorProfile && (
          <Card className="plate">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Your donor record is not complete. Finish onboarding to appear in
              matching.
            </CardContent>
          </Card>
        )}

        {(user?.role === "blood_bank" || user?.role === "hospital") && (
          <Card className="plate">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="font-serif text-lg">
                  {org?.name ?? "Organization"}
                </CardTitle>
                {org && <StatusStamp value={org.verificationStatus} />}
              </div>
              <CardDescription>
                Organization details are managed from the Registry page.
              </CardDescription>
            </CardHeader>
            {org && (
              <CardContent className="text-sm text-muted-foreground">
                <p>{org.address}, {org.city}</p>
                <p className="font-mono">{org.contactPhone}</p>
                <p>{org.operatingHours}</p>
              </CardContent>
            )}
          </Card>
        )}

        {user?.role === "requester" && (
          <Card className="plate">
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                Requester record
              </CardTitle>
              <CardDescription>
                Nothing to maintain — every emergency you file lives in the
                Emergencies ledger. PranSetu deliberately stores no patient
                medical data.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {user?.role === "admin" && (
          <Card className="plate">
            <CardHeader>
              <CardTitle className="font-serif text-lg">Archivist</CardTitle>
              <CardDescription>
                Administrative duties live in the Ledger.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

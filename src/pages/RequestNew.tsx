import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2, Siren } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BLOOD_GROUPS,
  REQUEST_TTL_HOURS,
  type BloodGroup,
} from "@/convex/lib/constants";
import { compatibleDonorsFor } from "@/convex/lib/compatibility";

export default function RequestNew() {
  const navigate = useNavigate();
  const [patientRef, setPatientRef] = useState("");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">("");
  const [units, setUnits] = useState(1);
  const [urgency, setUrgency] = useState<"routine" | "urgent" | "critical">(
    "urgent",
  );
  const [hospitalName, setHospitalName] = useState("");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [contactPhone, setContactPhone] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const create = useMutation(api.requests.create);

  const canSubmit =
    patientRef.trim() &&
    bloodGroup &&
    hospitalName.trim() &&
    location?.lat &&
    location?.lng &&
    contactPhone.trim() &&
    requiredBy;

  const handleSubmit = async () => {
    if (!canSubmit) {
      toast.error("Please complete all required fields.");
      return;
    }
    setSubmitting(true);
    try {
      const id = await create({
        patientRef: patientRef.trim(),
        bloodGroup: bloodGroup as BloodGroup,
        unitsRequired: units,
        urgency,
        hospitalName: hospitalName.trim(),
        city: location?.city?.trim() || "—",
        lat: location!.lat,
        lng: location!.lng,
        contactPhone: contactPhone.trim(),
        requiredBy: new Date(requiredBy).getTime(),
        description: description.trim() || undefined,
      });
      toast.success("Emergency filed. Matching donors are being notified.");
      navigate(`/requests/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not file.");
      setSubmitting(false);
    }
  };

  const compatible = bloodGroup ? compatibleDonorsFor(bloodGroup) : [];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <p className="stamp text-muted-foreground">Emergency · New Filing</p>
        <h1 className="mt-1 flex items-center gap-2 font-serif text-3xl font-bold">
          <Siren className="size-7 text-destructive" /> File an emergency
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Filed requests stay active for {REQUEST_TTL_HOURS} hours, are visible
          to nearby donors, and are reviewed by an archivist.
        </p>

        <Card className="plate mt-6">
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rn-patient">
                  Patient reference
                </Label>
                <Input
                  id="rn-patient"
                  value={patientRef}
                  onChange={(e) => setPatientRef(e.target.value)}
                  placeholder="Initials, e.g. “A.S.”"
                  maxLength={12}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact phone</Label>
                <Input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 …"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Blood group</Label>
                <Select
                  value={bloodGroup}
                  onValueChange={(v) => setBloodGroup(v as BloodGroup)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
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
                <Label htmlFor="rn-units">Units required</Label>
                <Input
                  id="rn-units"
                  type="number"
                  min={1}
                  max={10}
                  value={units}
                  onChange={(e) =>
                    setUnits(Math.max(1, Math.min(10, Number(e.target.value))))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Urgency</Label>
                <Select
                  value={urgency}
                  onValueChange={(v) =>
                    setUrgency(v as "routine" | "urgent" | "critical")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="routine">Routine</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {bloodGroup && (
              <p className="text-xs text-muted-foreground">
                Can donate to {bloodGroup}:{" "}
                <span className="font-mono">{compatible.join(", ")}</span>
              </p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="rn-hospital">Hospital / facility name</Label>
              <Input
                id="rn-hospital"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder="e.g. St. Mary's Hospital"
              />
            </div>

            <div>
              <Label>Hospital location</Label>
              <div className="mt-2">
                <LocationPicker
                  value={location}
                  onChange={setLocation}
                  idPrefix="rn"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rn-by">Blood needed by</Label>
                <Input
                  id="rn-by"
                  type="datetime-local"
                  value={requiredBy}
                  onChange={(e) => setRequiredBy(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rn-desc">
                  Notes <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="rn-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ward, department, context…"
                  rows={2}
                />
              </div>
            </div>

            <div className="rounded-sm border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                By filing you confirm this request is genuine. False emergency
                filings are recorded against your account and reviewed by
                archivists. For immediate medical danger, call your local
                emergency number first — {`PranSetu`} coordinates donors, it does
                not replace emergency services.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Filing…
                  </>
                ) : (
                  "File emergency request"
                )}
              </Button>
              <Button
                variant="outline"
                asChild
                disabled={submitting}
              >
                <Link to="/requests">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

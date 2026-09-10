import { useState } from "react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { APP_NAME } from "@/convex/lib/constants";
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
import {
  BLOOD_GROUPS,
  type BloodGroup,
} from "@/convex/lib/constants";

type RoleChoice = "donor" | "requester" | "blood_bank" | "hospital";

const ROLE_CARDS: {
  value: RoleChoice;
  title: string;
  body: string;
}[] = [
  {
    value: "donor",
    title: "Donor",
    body: "Give blood when nearby emergencies need your type.",
  },
  {
    value: "requester",
    title: "Requester",
    body: "File emergency blood requests and track responses live.",
  },
  {
    value: "blood_bank",
    title: "Blood Bank",
    body: "Publish inventory and answer requests for units.",
  },
  {
    value: "hospital",
    title: "Hospital Coordinator",
    body: "Verify and coordinate emergencies for your institution.",
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [role, setRole] = useState<RoleChoice | null>(null);
  const [name, setName] = useState("");
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | "">("");
  const [location, setLocation] = useState<LocationValue | null>(null);
  const [lastDonation, setLastDonation] = useState("");
  const [orgName, setOrgName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const join = useMutation(api.users.join);

  const isOrgRole = role === "blood_bank" || role === "hospital";

  const handleSubmit = async () => {
    if (!role) return;
    if (!name.trim()) {
      toast.error("Please tell us your name.");
      return;
    }
    if (role === "donor") {
      if (!bloodGroup) {
        toast.error("Please choose your blood group.");
        return;
      }
      if (
        !location ||
        !location.label.trim() ||
        !location.city.trim() ||
        !location.lat ||
        !location.lng
      ) {
        toast.error("Please set your approximate location.");
        return;
      }
    }
    if (isOrgRole) {
      if (!orgName.trim() || !address.trim() || !contactPhone.trim()) {
        toast.error("Organization name, address and contact are required.");
        return;
      }
      if (!location || !location.lat || !location.lng) {
        toast.error("Please set the organization location.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await join({
        role,
        name: name.trim(),
        donor:
          role === "donor"
            ? {
                bloodGroup: bloodGroup as BloodGroup,
                lat: location!.lat,
                lng: location!.lng,
                locationLabel: location!.label.trim(),
                lastDonationDate: lastDonation || undefined,
              }
            : undefined,
        org:
          isOrgRole && location
            ? {
                name: orgName.trim(),
                type: role === "blood_bank" ? "blood_bank" : "hospital",
                contactPhone: contactPhone.trim(),
                address: address.trim(),
                city: location.city.trim() || "—",
                lat: location.lat,
                lng: location.lng,
                operatingHours: operatingHours.trim() || "—",
              }
            : undefined,
      });
      toast.success("Welcome to PranSetu.");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl">
        <p className="stamp text-muted-foreground">Registry · New Entry</p>
        <h1 className="mt-1 font-serif text-3xl font-bold">
          Join {APP_NAME}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Tell us how you will use the bridge. You can adjust everything later
          on your profile.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {ROLE_CARDS.map((card) => (
            <button
              key={card.value}
              type="button"
              onClick={() => setRole(card.value)}
              className={`rounded-md border p-4 text-left transition-colors ${
                role === card.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <h3 className="smallcaps text-lg font-bold text-primary">
                {card.title}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{card.body}</p>
            </button>
          ))}
        </div>

        {role && (
          <Card className="plate mt-6">
            <CardHeader>
              <CardTitle className="font-serif text-lg">
                {isOrgRole ? "Organization details" : "Your details"}
              </CardTitle>
              <CardDescription>
                {isOrgRole
                  ? "New organizations are reviewed by an archivist before they appear publicly."
                  : "Only what coordination needs — nothing more."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="onb-name">
                  {isOrgRole ? "Your name" : "Your name"}
                </Label>
                <Input
                  id="onb-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. A. Sharma"
                />
              </div>

              {role === "donor" && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                      <Label htmlFor="onb-lastdon">
                        Last donation <span className="text-muted-foreground">(optional)</span>
                      </Label>
                      <Input
                        id="onb-lastdon"
                        type="date"
                        value={lastDonation}
                        onChange={(e) => setLastDonation(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Approximate location</Label>
                    <div className="mt-2">
                      <LocationPicker
                        value={location}
                        onChange={setLocation}
                        idPrefix="onb"
                      />
                    </div>
                  </div>
                </>
              )}

              {isOrgRole && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="onb-org">Organization name</Label>
                    <Input
                      id="onb-org"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder={
                        role === "blood_bank"
                          ? "e.g. City Blood Bank"
                          : "e.g. St. Mary's Hospital"
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="onb-phone">Contact phone</Label>
                    <Input
                      id="onb-phone"
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+91 …"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="onb-addr">Address</Label>
                    <Input
                      id="onb-addr"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street, area"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="onb-hours">Operating hours</Label>
                    <Input
                      id="onb-hours"
                      value={operatingHours}
                      onChange={(e) => setOperatingHours(e.target.value)}
                      placeholder="e.g. 24 × 7 / 9am–9pm"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <div className="mt-2">
                      <LocationPicker
                        value={location}
                        onChange={setLocation}
                        idPrefix="onborg"
                      />
                    </div>
                  </div>
                </>
              )}

              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Filing…
                  </>
                ) : (
                  "Complete registration"
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

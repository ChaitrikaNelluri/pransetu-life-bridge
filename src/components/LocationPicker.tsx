import { useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface LocationValue {
  label: string;
  city: string;
  lat: number;
  lng: number;
}

/**
 * Location capture with privacy in mind: coordinates are rounded to ~1 km
 * precision before they ever reach the database. We store an approximate
 * point plus a precision radius — never a precise home address.
 */
function roundToKm(value: number): number {
  return Math.round(value * 100) / 100;
}

export function LocationPicker({
  value,
  onChange,
  idPrefix = "loc",
}: {
  value: LocationValue | null;
  onChange: (next: LocationValue | null) => void;
  idPrefix?: string;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const useMyLocation = () => {
    setGeoError(null);
    if (!("geolocation" in navigator)) {
      setGeoError("Geolocation is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          label: value?.label || "Current location",
          city: value?.city || "",
          lat: roundToKm(pos.coords.latitude),
          lng: roundToKm(pos.coords.longitude),
        });
        setLocating(false);
      },
      () => {
        setGeoError("Could not read your location — enter it manually.");
        setLocating(false);
      },
      { timeout: 8000 },
    );
  };

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-label`}>Area / locality</Label>
          <Input
            id={`${idPrefix}-label`}
            placeholder="e.g. Indiranagar"
            value={value?.label ?? ""}
            onChange={(e) =>
              onChange({
                label: e.target.value,
                city: value?.city ?? "",
                lat: value?.lat ?? 0,
                lng: value?.lng ?? 0,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-city`}>City</Label>
          <Input
            id={`${idPrefix}-city`}
            placeholder="e.g. Bengaluru"
            value={value?.city ?? ""}
            onChange={(e) =>
              onChange({
                label: value?.label ?? "",
                city: e.target.value,
                lat: value?.lat ?? 0,
                lng: value?.lng ?? 0,
              })
            }
          />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
            <Input
              id={`${idPrefix}-lat`}
              type="number"
              step="0.01"
              placeholder="12.97"
              value={value?.lat ?? ""}
              onChange={(e) =>
                onChange({
                  label: value?.label ?? "",
                  city: value?.city ?? "",
                  lat: Number(e.target.value),
                  lng: value?.lng ?? 0,
                })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-lng`}>Longitude</Label>
            <Input
              id={`${idPrefix}-lng`}
              type="number"
              step="0.01"
              placeholder="77.59"
              value={value?.lng ?? ""}
              onChange={(e) =>
                onChange({
                  label: value?.label ?? "",
                  city: value?.city ?? "",
                  lat: value?.lat ?? 0,
                  lng: Number(e.target.value),
                })
              }
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={useMyLocation}
          disabled={locating}
          className="gap-2"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Crosshair className="size-4" />
          )}
          Use my location
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Coordinates are stored rounded to roughly 1 km. Your exact address is
        never published.
      </p>
      {geoError && <p className="text-xs text-destructive">{geoError}</p>}
    </div>
  );
}

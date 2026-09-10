import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { Crosshair, MapPin, Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import { LocationPicker, type LocationValue } from "@/components/LocationPicker";
import { BloodGroupChip } from "@/components/vintage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { haversineKm } from "@/convex/lib/geo";
import { cn } from "@/lib/utils";

type Pin = {
  id: string;
  kind: "emergency" | "blood_bank" | "donor";
  label: string;
  lat: number;
  lng: number;
  detail: string;
};

const PIN_STYLE: Record<Pin["kind"], { dot: string; label: string }> = {
  emergency: { dot: "bg-destructive", label: "Emergency" },
  blood_bank: { dot: "bg-chart-5", label: "Blood bank" },
  donor: { dot: "bg-primary", label: "Donor (approx.)" },
};

/** Default centre if the visitor has no location on file — Bengaluru. */
const FALLBACK_CENTER = { lat: 12.9716, lng: 77.5946 };

/** Full-width route: the map needs the room. */
export default function MapView() {
  const mapConfig = useQuery(api.maps.mapConfig);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState("");
  const [loc, setLoc] = useState<LocationValue | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const geocode = useAction(api.maps.geocode);

  const active = center ?? FALLBACK_CENTER;
  const pins = useQuery(api.system.mapPins, {
    centerLat: active.lat,
    centerLng: active.lng,
  });

  const allPins: Pin[] = useMemo(
    () =>
      pins
        ? [...pins.emergency, ...pins.bloodBanks, ...pins.donors]
        : [],
    [pins],
  );

  const findPlace = async () => {
    if (!place.trim()) return;
    setGeocoding(true);
    try {
      const result = await geocode({ query: place.trim() });
      setCenter({ lat: result.lat, lng: result.lng });
      toast.success(
        result.source === "google"
          ? "Located via Google Maps"
          : "Located via the offline gazetteer (no Maps key configured)",
      );
    } catch {
      toast.error("Could not find that place. Try a nearby city name.");
    } finally {
      setGeocoding(false);
    }
  };

  const useMyLocation = (value: LocationValue | null) => {
    setLoc(value);
    if (value && value.lat !== 0 && value.lng !== 0) {
      setCenter({ lat: value.lat, lng: value.lng });
    }
  };

  return (
    <AppShell wide>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="smallcaps text-xs text-muted-foreground">
              Folio V — Cartography
            </p>
            <h1 className="font-serif text-3xl font-bold">The Survey Chart</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Live emergencies, verified blood banks, and approximate donor
              positions within 50 km of the marked centre. Donor markers are
              deliberately imprecise — roughly 1 km — and never show names.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {Object.entries(PIN_STYLE).map(([kind, style]) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", style.dot)} />
                {style.label}
              </span>
            ))}
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Centre the chart</CardTitle>
            <CardDescription>
              Geocoding runs server-side and is cached — repeat lookups cost
              nothing. {mapConfig?.hasGoogleMaps === false
                ? "No Google Maps key is configured, so a built-in gazetteer answers instead; donor search never depends on Maps."
                : "Google Maps is configured; candidate discovery still runs locally."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="place-search">Find a city or locality</Label>
              <div className="flex gap-2">
                <Input
                  id="place-search"
                  placeholder="e.g. Bengaluru, Indiranagar"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void findPlace()}
                />
                <Button
                  type="button"
                  onClick={() => void findPlace()}
                  disabled={geocoding || !place.trim()}
                  className="gap-2"
                >
                  <Search className="size-4" />
                  {geocoding ? "Locating…" : "Locate"}
                </Button>
              </div>
            </div>
            <div>
              <Label>Or use the precise picker</Label>
              <div className="mt-2">
                <LocationPicker
                  value={loc}
                  onChange={useMyLocation}
                  idPrefix="map-centre"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <MapCanvas
          center={active}
          pins={allPins}
          browserKey={
            (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ||
            undefined
          }
        />

        <PinLedger center={active} pins={allPins} />
      </div>
    </AppShell>
  );
}

/** Google Maps embed when a browser key exists; SVG survey chart otherwise. */
function MapCanvas({
  center,
  pins,
  browserKey,
}: {
  center: { lat: number; lng: number };
  pins: Pin[];
  browserKey?: string | false;
}) {
  if (browserKey) {
    return (
      <div className="overflow-hidden rounded-lg border border-border/70">
        <iframe
          title="PranSetu survey map"
          width="100%"
          height="480"
          style={{ border: 0, display: "block" }}
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps/embed/v1/view?key=${browserKey}&center=${center.lat},${center.lng}&zoom=12&maptype=roadmap`}
          allowFullScreen
        />
        <p className="border-t border-border/70 bg-card px-4 py-2 text-xs text-muted-foreground">
          Live Google map centred on the marked point. Pins are rendered in the
          ledger below — the embed keeps donor approximations out of the tiles.
        </p>
      </div>
    );
  }
  return <SurveyChart center={center} pins={pins} />;
}

/** Privacy-aware SVG chart — the "Maps failed" fallback that always works. */
function SurveyChart({
  center,
  pins,
}: {
  center: { lat: number; lng: number };
  pins: Pin[];
}) {
  const bounds = useMemo(() => {
    const lats = [center.lat, ...pins.map((p) => p.lat)];
    const lngs = [center.lng, ...pins.map((p) => p.lng)];
    // Minimum span ≈ 12 km so a lone centre still reads as a chart.
    let latSpan = Math.max(Math.max(...lats) - Math.min(...lats), 12 / 111.32);
    let lngSpan = Math.max(
      Math.max(...lngs) - Math.min(...lngs),
      12 / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180))),
    );
    latSpan *= 1.25; // breathing room
    lngSpan *= 1.25;
    return {
      top: center.lat + latSpan / 2,
      bottom: center.lat - latSpan / 2,
      left: center.lng - lngSpan / 2,
      right: center.lng + lngSpan / 2,
    };
  }, [center, pins]);

  const project = (lat: number, lng: number) => ({
    x: ((lng - bounds.left) / (bounds.right - bounds.left)) * 100,
    y: ((bounds.top - lat) / (bounds.top - bounds.bottom)) * 100,
  });

  // Radius rings at 5 / 10 / 25 / 50 km, drawn as ellipses (deg → % of canvas).
  const rings = [5, 10, 25, 50].map((km) => {
    const dLat = (km / 111.32 / (bounds.top - bounds.bottom)) * 100;
    const dLng =
      (km / (111.32 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)))) /
      (bounds.right - bounds.left) *
      100;
    return { km, dLat, dLng };
  });
  const c = project(center.lat, center.lng);

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/8]">
        {/* grid */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in oklab, var(--color-border) 40%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 40%, transparent) 1px, transparent 1px)",
            backgroundSize: "8.333% 12.5%",
          }}
        />
        {/* radius rings */}
        {rings.map((r) => (
          <div
            key={r.km}
            className="absolute rounded-[50%] border border-dashed border-border"
            style={{
              left: `${c.x - r.dLng / 2}%`,
              top: `${c.y - r.dLat / 2}%`,
              width: `${r.dLng}%`,
              height: `${r.dLat}%`,
            }}
          />
        ))}
        {/* pins */}
        {pins.map((p) => {
          const pos = project(p.lat, p.lng);
          return (
            <button
              key={p.id}
              type="button"
              title={`${p.label} — ${p.detail}`}
              className={cn(
                "group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md transition-transform hover:scale-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                PIN_STYLE[p.kind].dot,
                p.kind === "donor" ? "size-3 opacity-80" : "size-4",
              )}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              aria-label={`${PIN_STYLE[p.kind].label}: ${p.label}`}
            />
          );
        })}
        {/* centre crosshair */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
        >
          <Crosshair className="size-6 text-foreground/80" />
        </div>
        {/* scale legend */}
        <div className="absolute bottom-2 left-2 rounded-sm border border-border/70 bg-background/85 px-2 py-1 text-[10px] text-muted-foreground">
          Survey chart — dashed rings mark 5 / 10 / 25 / 50 km ·
          {" "}
          {pins.length} pin{pins.length === 1 ? "" : "s"}
        </div>
      </div>
      <p className="border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
        Offline fallback rendering. Configure{" "}
        <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> (Maps Embed
        API, referrer-restricted) for live Google tiles. Candidate discovery and
        matching never depend on this map.
      </p>
    </div>
  );
}

/** Distance-sorted ledger of everything on the chart. */
function PinLedger({
  center,
  pins,
}: {
  center: { lat: number; lng: number };
  pins: Pin[];
}) {
  const groups = useMemo(() => {
    const withDistance = pins
      .map((p) => ({
        ...p,
        distanceKm: haversineKm(center.lat, center.lng, p.lat, p.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    return {
      emergency: withDistance.filter((p) => p.kind === "emergency"),
      blood_bank: withDistance.filter((p) => p.kind === "blood_bank"),
      donor: withDistance.filter((p) => p.kind === "donor"),
    };
  }, [center, pins]);

  const sections: { kind: Pin["kind"]; title: string }[] = [
    { kind: "emergency", title: "Open emergencies" },
    { kind: "blood_bank", title: "Verified blood banks" },
    { kind: "donor", title: "Available donors (approximate)" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {sections.map(({ kind, title }) => (
        <Card key={kind}>
          <CardHeader className="pb-3">
            <CardTitle className="font-serif text-base">{title}</CardTitle>
            <CardDescription>
              {groups[kind].length} within the chart
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {groups[kind].length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing recorded nearby. Try re-centring the chart.
              </p>
            )}
            {groups[kind].map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-2 rounded-sm border border-border/60 px-2.5 py-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    <MapPin className="size-3 shrink-0 text-muted-foreground" />
                    {p.kind === "emergency" ? (
                      <>
                        <BloodGroupChip
                          group={p.label.split(" · ")[0]}
                          className="px-1 py-0"
                        />
                        {p.label.split(" · ")[1]}
                      </>
                    ) : (
                      p.label
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.detail}
                  </p>
                </div>
                <span className="smallcaps shrink-0 text-[11px] text-muted-foreground">
                  {p.distanceKm.toFixed(1)} km
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Blood group chip in archival label style. */
export function BloodGroupChip({
  group,
  className,
}: {
  group: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-sm border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-primary",
        className,
      )}
    >
      {group}
    </span>
  );
}

const STAMP_STYLES: Record<string, string> = {
  SUBMITTED: "text-chart-4 border-chart-4/70 bg-chart-4/10",
  VERIFICATION_PENDING: "text-chart-4 border-chart-4/70 bg-chart-4/10",
  ACTIVE: "text-chart-2 border-chart-2/70 bg-chart-2/10",
  DONOR_CONTACTED: "text-primary border-primary/60 bg-primary/10",
  DONOR_ACCEPTED: "text-chart-3 border-chart-3/70 bg-chart-3/10",
  PARTIALLY_FULFILLED: "text-chart-4 border-chart-4/70 bg-chart-4/10",
  FULFILLED: "text-chart-3 border-chart-3/70 bg-chart-3/10",
  CLOSED: "text-muted-foreground border-muted-foreground/60",
  CANCELLED: "text-muted-foreground border-muted-foreground/60",
  EXPIRED: "text-destructive border-destructive/60 bg-destructive/5",
  REJECTED: "text-destructive border-destructive/60",
  verified: "text-chart-3 border-chart-3/70 bg-chart-3/10",
  unverified: "text-muted-foreground border-muted-foreground/50",
  pending: "text-chart-4 border-chart-4/70 bg-chart-4/10",
  rejected: "text-destructive border-destructive/60",
  critical: "text-destructive border-destructive/70 bg-destructive/10",
  urgent: "text-chart-4 border-chart-4/70 bg-chart-4/10",
  routine: "text-muted-foreground border-muted-foreground/50",
  donor: "text-primary border-primary/50 bg-primary/5",
  blood_bank: "text-chart-5 border-chart-5/70 bg-chart-5/10",
  hospital: "text-chart-2 border-chart-2/70 bg-chart-2/10",
};

/** Rubber-stamp status marker. */
export function StatusStamp({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const style = STAMP_STYLES[value] ?? "text-muted-foreground border-muted-foreground/60";
  return (
    <span
      className={cn(
        "stamp-seal whitespace-nowrap",
        style,
        className,
      )}
      data-status={value}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

export { Badge };

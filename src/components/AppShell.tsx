import { Link, NavLink, useNavigate } from "react-router";
import { LogOut } from "lucide-react";
import {
  APP_NAME,
  APP_NAME_DEVANAGARI,
  APP_TAGLINE,
} from "@/convex/lib/constants";
import { useAuth } from "@/hooks/use-auth";
import { PranSetuMark } from "./PranSetuMark";
import { NotificationsBell } from "./NotificationsBell";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const BASE_NAV = [
  { to: "/dashboard", label: "Desk" },
  { to: "/requests", label: "Emergencies" },
  { to: "/blood-banks", label: "Blood Banks" },
  { to: "/map", label: "Map" },
  { to: "/profile", label: "Profile" },
];

const ROLE_NAME: Record<string, string> = {
  admin: "Archivist",
  donor: "Donor",
  requester: "Requester",
  blood_bank: "Blood Bank",
  hospital: "Coordinator",
  user: "Member",
};

export function AppShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const nav = [...BASE_NAV];
  if (user?.role === "admin") {
    nav.splice(3, 0, { to: "/admin", label: "Ledger" });
  }
  if (user?.role === "blood_bank" || user?.role === "hospital") {
    nav.splice(3, 0, { to: "/org", label: "Registry" });
  }

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 bg-card/70 backdrop-blur-sm">
        <div
          className={cn(
            "mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4",
            wide && "max-w-full",
          )}
        >
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <PranSetuMark className="size-8 text-primary" />
            <span className="leading-tight">
              <span className="block font-serif text-lg font-bold tracking-tight">
                {APP_NAME}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {APP_NAME_DEVANAGARI}
                </span>
              </span>
              <span className="smallcaps block text-[11px] text-muted-foreground">
                {APP_TAGLINE}
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-sm px-3 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-secondary font-semibold text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <span className="stamp hidden text-muted-foreground sm:inline">
              {ROLE_NAME[user?.role ?? "user"] ?? "Member"}
            </span>
            <NotificationsBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto px-4 py-8", wide ? "max-w-7xl" : "max-w-5xl")}>
        {children}
      </main>

      {/* mobile nav */}
      <nav className="sticky bottom-0 z-10 flex border-t border-border/70 bg-card/90 backdrop-blur-sm md:hidden">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex-1 py-3 text-center text-xs",
                isActive
                  ? "font-semibold text-primary"
                  : "text-muted-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <footer className="border-t border-border/70 py-4 text-center">
        <p className="stamp text-muted-foreground">
          {APP_NAME} — coordination platform, not a medical service. In an
          emergency call your local emergency number first.
        </p>
      </footer>
    </div>
  );
}

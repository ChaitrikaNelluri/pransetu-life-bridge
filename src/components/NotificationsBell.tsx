import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const { user } = useAuth();
  const notifications = useQuery(
    api.notifications.forUser,
    user?._id ? { userId: user._id } : "skip",
  );
  const markAll = useMutation(api.notifications.markAllRead);

  const unread = (notifications ?? []).filter((n) => !n.read).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 ink-rule">
          <span className="stamp text-muted-foreground">Notifications</span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => markAll({ userId: user!._id })}
            >
              <CheckCheck className="size-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {(notifications ?? []).length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notices on file.
            </p>
          )}
          {(notifications ?? []).map((n) => (
            <div
              key={n._id}
              className={cn(
                "border-b border-border/50 px-3 py-2.5 last:border-0",
                !n.read && "bg-primary/5",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</p>
                <span className="shrink-0 stamp text-[10px] text-muted-foreground">
                  {timeAgo(n.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

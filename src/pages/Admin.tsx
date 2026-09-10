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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusStamp, BloodGroupChip } from "@/components/vintage";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { timeAgo } from "@/lib/format";
import type { Id } from "@/convex/_generated/dataModel";

export default function Admin() {
  const orgs = useQuery(api.admin.pendingOrgs);
  const active = useQuery(api.admin.activeRequests);
  const stats = useQuery(api.admin.stats);
  const logs = useQuery(api.admin.auditTrail);
  const verificationQueue = useQuery(api.admin.verificationQueue);
  const openReports = useQuery(api.admin.openReports);
  const users = useQuery(api.admin.users, {});

  const verifyOrg = useMutation(api.admin.verifyOrg);
  const verifyRequest = useMutation(api.admin.verifyRequest);
  const resolveReport = useMutation(api.admin.resolveReport);
  const setSuspension = useMutation(api.admin.setUserSuspension);

  const decide = async (orgId: Id<"organizations">, approve: boolean) => {
    try {
      await verifyOrg({ orgId, approve });
      toast.success(approve ? "Organization verified." : "Organization rejected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <p className="stamp text-muted-foreground">Archivist's Ledger</p>
          <h1 className="mt-1 font-serif text-3xl font-bold">Administration</h1>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Active emergencies", value: stats?.activeRequests },
            { label: "Pending org reviews", value: stats?.pendingOrgs },
            { label: "Verified orgs", value: stats?.verifiedOrgs },
            { label: "Registered donors", value: stats?.donors },
          ].map((m) => (
            <Card key={m.label} className="plate">
              <CardContent className="pt-6 text-center">
                <p className="font-serif text-4xl font-black text-primary">
                  {m.value ?? "—"}
                </p>
                <p className="smallcaps mt-1 text-sm text-muted-foreground">
                  {m.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="verifications">
          <TabsList className="flex-wrap">
            <TabsTrigger value="verifications">
              Request verification{" "}
              {verificationQueue && verificationQueue.length > 0 && (
                <Badge className="ml-1.5 px-1 py-0 text-[10px]">
                  {verificationQueue.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="orgs">
              Organizations{" "}
              {orgs && orgs.length > 0 && (
                <Badge className="ml-1.5 px-1 py-0 text-[10px]">{orgs.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="emergencies">Emergencies</TabsTrigger>
            <TabsTrigger value="reports">
              Reports{" "}
              {openReports && openReports.length > 0 && (
                <Badge className="ml-1.5 px-1 py-0 text-[10px]">
                  {openReports.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="audit">Audit trail</TabsTrigger>
          </TabsList>

          <TabsContent value="verifications" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">
                  Emergency verification queue
                </CardTitle>
                <CardDescription>
                  Confirm details by phone or hospital record, then approve or
                  reject. Unreviewed filings auto-activate after 30 minutes —
                  verification must never block a genuine emergency.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!verificationQueue || verificationQueue.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    Nothing awaiting verification.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {verificationQueue.map((r) => (
                      <div
                        key={r._id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/70 px-3 py-2.5"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <BloodGroupChip group={r.bloodGroup} />
                            <span className="text-sm font-semibold">
                              {r.hospitalName}
                            </span>
                            <StatusStamp value={r.urgency} />
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.city} · {r.unitsRequired} units · filed{" "}
                            {timeAgo(r._creationTime)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() =>
                              verifyRequest({ requestId: r._id, approve: true })
                                .then(() => toast.success("Approved & donors notified."))
                                .catch((e) => toast.error(e instanceof Error ? e.message : "Failed."))
                            }
                          >
                            <Check className="size-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() =>
                              verifyRequest({ requestId: r._id, approve: false })
                                .then(() => toast.success("Rejected."))
                                .catch((e) => toast.error(e instanceof Error ? e.message : "Failed."))
                            }
                          >
                            <X className="size-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orgs" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">
                  Awaiting verification
                </CardTitle>
                <CardDescription>
                  Verify after checking registration details by phone or in
                  person. Verified organizations appear in the public
                  directory.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!orgs || orgs.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No organizations awaiting review.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {orgs.map((o) => (
                      <div
                        key={o._id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/70 px-3 py-2.5"
                      >
                        <div>
                          <p className="text-sm font-semibold">{o.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.type === "blood_bank" ? "Blood bank" : "Hospital"}{" "}
                            · {o.address}, {o.city} · {o.contactPhone}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            filed {timeAgo(o._creationTime)}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => decide(o._id, true)}
                          >
                            <Check className="size-3.5" /> Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => decide(o._id, false)}
                          >
                            <X className="size-3.5" /> Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emergencies" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">
                  Active emergency folios
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!active || active.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No active emergencies.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Group</TableHead>
                        <TableHead>Hospital</TableHead>
                        <TableHead>Urgency</TableHead>
                        <TableHead>Units</TableHead>
                        <TableHead>Filed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {active.map((r) => (
                        <TableRow key={r._id}>
                          <TableCell>
                            <BloodGroupChip group={r.bloodGroup} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.hospitalName}
                            <span className="block text-xs text-muted-foreground">
                              {r.city}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusStamp value={r.urgency} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.unitsFulfilled}/{r.unitsRequired}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {timeAgo(r._creationTime)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">
                  Audit trail
                </CardTitle>
                <CardDescription>
                  Append-only record of sensitive actions. Ordinary members
                  cannot read this ledger.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!logs || logs.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    The trail is empty.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l._id}>
                          <TableCell className="stamp text-xs">
                            {l.action}
                          </TableCell>
                          <TableCell className="text-xs">{l.target}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {timeAgo(l.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">Users</CardTitle>
                <CardDescription>
                  Suspend abusive accounts; restore them when resolved.
                  Suspended users cannot act anywhere in the system.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!users || users.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No users registered yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u._id}>
                          <TableCell className="text-sm">
                            {u.name ?? "—"}
                            <span className="block text-xs text-muted-foreground">
                              {u.email ?? ""}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusStamp value={u.role ?? "user"} />
                          </TableCell>
                          <TableCell>
                            {u.suspended ? (
                              <span className="stamp text-destructive">SUSPENDED</span>
                            ) : (
                              <span className="stamp text-chart-3">ACTIVE</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant={u.suspended ? "outline" : "destructive"}
                              onClick={() =>
                                setSuspension({ userId: u._id, suspended: !u.suspended })
                                  .then(() =>
                                    toast.success(
                                      u.suspended ? "Account restored." : "Account suspended.",
                                    ),
                                  )
                                  .catch((e) =>
                                    toast.error(e instanceof Error ? e.message : "Failed."),
                                  )
                              }
                            >
                              {u.suspended ? "Restore" : "Suspend"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="font-serif text-lg">Abuse reports</CardTitle>
              </CardHeader>
              <CardContent>
                {!openReports || openReports.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">
                    No open reports.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {openReports.map((rep) => (
                      <div
                        key={rep._id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border/70 px-3 py-2.5"
                      >
                        <div>
                          <p className="stamp text-xs text-destructive">
                            {rep.category}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {rep.requestId
                              ? `emergency folio ${rep.requestId.slice(-6)}`
                              : ""}{" "}
                            · filed {timeAgo(rep.createdAt)}
                            {rep.details ? ` · “${rep.details}”` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              resolveReport({ reportId: rep._id, outcome: "resolved" })
                                .then(() => toast.success("Resolved."))
                                .catch(() => toast.error("Failed."))
                            }
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              resolveReport({ reportId: rep._id, outcome: "dismissed" })
                                .then(() => toast.success("Dismissed."))
                                .catch(() => toast.error("Failed."))
                            }
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </AppShell>
  );
}

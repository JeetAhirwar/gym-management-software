import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, DownloadIcon, GaugeIcon, Loader2Icon, PencilIcon, UsersIcon, } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton, Stagger, TableSkeleton } from "@/components/shared/States";
import { SmartImage } from "@/components/shared/SmartImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { downloadCsv, toCsv } from "@/lib/csv";
import { addDays, parseDateOnly, ymdInTz } from "@/lib/datetime";
import { formatDate, formatDateTime, formatNumberIN } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { AttendanceCorrectionDialog } from "./AttendanceCorrectionDialog";
import { ATTENDANCE_STATUS_LABELS, METHOD_LABELS, hourLabel } from "./labels";
/** Rows per page of the history table. */
const PAGE_SIZE = 15;
/** Default window shown when the page opens. */
const DEFAULT_RANGE_DAYS = 7;
/** Services cap page size at 200 — use it to sweep the export in fewest calls. */
const EXPORT_PAGE_SIZE = 200;
/** Safety net so a huge filter cannot loop forever while exporting. */
const MAX_EXPORT_PAGES = 25;
const MS_PER_DAY = 86_400_000;
const STATUS_STYLES = {
    checked_in: "border-primary/30 bg-primary/10 text-primary",
    checked_out: "border-border bg-muted text-muted-foreground",
};
const STATUS_OPTIONS = [
    { value: "all", label: "All statuses" },
    { value: "checked_in", label: "Checked in" },
    { value: "checked_out", label: "Checked out" },
];
/** `YYYY-MM-DD` → end of that day as a UTC instant (matches the service filters). */
function dayEnd(ymd) {
    return new Date(parseDateOnly(ymd).getTime() + MS_PER_DAY - 1);
}
function defaultFrom() {
    return ymdInTz(addDays(new Date(), -(DEFAULT_RANGE_DAYS - 1)));
}
function defaultTo() {
    return ymdInTz(new Date());
}
function SummaryCard({ label, display, hint, icon, }) {
    return (<Card className="graphite-surface border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </span>
        </div>
        <p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{display}</p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>);
}
function AttendanceBadge({ status }) {
    return (<Badge variant="outline" className={cn("font-medium", STATUS_STYLES[status])}>
      {ATTENDANCE_STATUS_LABELS[status]}
    </Badge>);
}
export function AttendanceHistoryPage() {
    const data = useData();
    const { session } = useAuth();
    const canCorrect = can(session?.profile.role, "attendance.correct");
    const [from, setFrom] = useState(defaultFrom);
    const [to, setTo] = useState(defaultTo);
    const [status, setStatus] = useState("all");
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const [exporting, setExporting] = useState(false);
    const rangeValid = from.length > 0 && to.length > 0 && from <= to;
    const query = useMemo(() => ({ from, to, status, page, pageSize: PAGE_SIZE }), [from, to, status, page]);
    const list = useAsync(() => data.listAttendance(query), [data, query], { enabled: rangeValid });
    const summaryRange = useMemo(() => ({ from: parseDateOnly(from), to: dayEnd(to) }), [from, to]);
    const summary = useAsync(() => data.getAttendanceSummary(summaryRange), [data, summaryRange], {
        enabled: rangeValid,
    });
    // A shrunken result set can leave us stranded past the last page — snap back.
    useEffect(() => {
        if (!list.data)
            return;
        const totalPages = Math.max(1, Math.ceil(list.data.total / list.data.pageSize));
        if (list.data.page > totalPages)
            setPage(totalPages);
    }, [list.data]);
    const resetFilters = () => {
        setFrom(defaultFrom());
        setTo(defaultTo());
        setStatus("all");
        setPage(1);
    };
    const items = list.data?.items ?? [];
    const total = list.data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const firstRow = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const lastRow = Math.min(page * PAGE_SIZE, total);
    const handleExport = () => {
        if (exporting || !rangeValid)
            return;
        setExporting(true);
        void (async () => {
            try {
                const collected = [];
                let currentPage = 1;
                let currentTotal = Number.POSITIVE_INFINITY;
                while (collected.length < currentTotal &&
                    currentPage <= MAX_EXPORT_PAGES) {
                    const result = await data.listAttendance({
                        from,
                        to,
                        status,
                        page: currentPage,
                        pageSize: EXPORT_PAGE_SIZE,
                    });
                    currentTotal = result.total;
                    collected.push(...result.items);
                    if (result.items.length === 0)
                        break;
                    currentPage += 1;
                }
                if (collected.length === 0) {
                    toast.info("Nothing to export for these filters.");
                    return;
                }
                downloadCsv(`attendance-${from}-to-${to}${status === "all" ? "" : `-${status}`}`, toCsv(collected, [
                    { header: "Member", accessor: (row) => row.memberName ?? "" },
                    { header: "Member ID", accessor: (row) => row.memberCode ?? "" },
                    { header: "Check-in", accessor: (row) => formatDateTime(row.checkIn) },
                    {
                        header: "Check-out",
                        accessor: (row) => (row.checkOut ? formatDateTime(row.checkOut) : ""),
                    },
                    { header: "Status", accessor: (row) => ATTENDANCE_STATUS_LABELS[row.status] },
                    { header: "Method", accessor: (row) => METHOD_LABELS[row.method] },
                    { header: "Scanner", accessor: (row) => row.scannerName ?? "" },
                    { header: "Notes", accessor: (row) => row.notes ?? "" },
                ]));
                toast.success(`Exported ${collected.length} ${collected.length === 1 ? "record" : "records"}`);
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to export these attendance records.");
            }
            finally {
                setExporting(false);
            }
        })();
    };
    const totalVisits = summary.data?.totalVisits ?? 0;
    const rangeHint = rangeValid ? `${formatDate(from)} – ${formatDate(to)}` : "Adjust the date range";
    return (<div className="space-y-6">
      <PageHeader title="Attendance history" description="Every check-in and check-out, with filters, export and corrections." breadcrumbs={[{ label: "Attendance", to: "/attendance" }, { label: "History" }]}/>

      {/* Summary strip */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.loading ? (Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32"/>)) : summary.error ? (<Card className="border-destructive/30 bg-destructive/5 sm:col-span-2 xl:col-span-4">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <p className="max-w-md text-sm text-muted-foreground">
                Unable to load the summary: {summary.error}
              </p>
              <Button variant="outline" size="sm" onClick={summary.reload}>
                Retry summary
              </Button>
            </CardContent>
          </Card>) : (<>
            <Stagger delayIndex={0}>
              <SummaryCard label="Total visits" display={formatNumberIN(totalVisits)} hint={rangeHint} icon={<CalendarCheckIcon className="size-4"/>}/>
            </Stagger>
            <Stagger delayIndex={1}>
              <SummaryCard label="Unique members" display={formatNumberIN(summary.data?.uniqueMembers ?? 0)} hint="Distinct members who visited" icon={<UsersIcon className="size-4"/>}/>
            </Stagger>
            <Stagger delayIndex={2}>
              <SummaryCard label="Average per day" display={formatNumberIN(summary.data?.averagePerDay ?? 0)} hint="Visits per day in this range" icon={<GaugeIcon className="size-4"/>}/>
            </Stagger>
            <Stagger delayIndex={3}>
              <SummaryCard label="Busiest hour" display={hourLabel(summary.data?.busiestHour ?? null)} hint={(summary.data?.busiestHour ?? null) === null
                ? "No check-ins in this range yet"
                : "Peak check-in time"} icon={<ClockIcon className="size-4"/>}/>
            </Stagger>
          </>)}
      </div>

      {/* Filters */}
      <Card className="graphite-surface gap-0 border-border/70 py-4 sm:py-5">
        <CardContent className="flex flex-col gap-3 px-4 sm:px-5 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="history-from">From</Label>
              <Input id="history-from" type="date" value={from} max={to || undefined} onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
        }}/>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="history-to">To</Label>
              <Input id="history-to" type="date" value={to} min={from || undefined} onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
        }}/>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => {
            setStatus(value);
            setPage(1);
        }}>
                <SelectTrigger className="w-full" aria-label="Filter by status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (<SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || !rangeValid || list.loading}>
              {exporting ? <Loader2Icon className="animate-spin"/> : <DownloadIcon />}
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Records */}
      <Card className="graphite-surface gap-0 border-border/70">
        {list.loading ? (<CardContent>
            <TableSkeleton rows={6} cols={8}/>
          </CardContent>) : !rangeValid ? (<CardContent>
            <EmptyState title="Check the date range" description="The start date has to be on or before the end date."/>
          </CardContent>) : list.error ? (<CardContent>
            <ErrorState title="Unable to load attendance" message={list.error} onRetry={list.reload}/>
          </CardContent>) : items.length === 0 ? (<CardContent>
            <EmptyState title="No attendance in this range" description="Try a wider date range, or check back after the first scan of the day." action={<Button size="sm" variant="outline" onClick={resetFilters}>
                  Reset filters
                </Button>}/>
          </CardContent>) : (<>
            <div className="px-2 sm:px-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Scanner</TableHead>
                    <TableHead>Notes</TableHead>
                    {canCorrect ? <TableHead className="text-right">Actions</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((record) => (<TableRow key={record.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <SmartImage src={record.memberPhoto} name={record.memberName ?? "Member"} className="size-8 shrink-0"/>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {record.memberName ?? "Member"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {record.memberCode ?? "—"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{formatDateTime(record.checkIn)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {record.checkOut ? formatDateTime(record.checkOut) : "—"}
                      </TableCell>
                      <TableCell>
                        <AttendanceBadge status={record.status}/>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {METHOD_LABELS[record.method]}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {record.scannerName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-48">
                        {record.notes ? (<span className="block truncate text-sm text-muted-foreground" title={record.notes}>
                            {record.notes}
                          </span>) : (<span className="text-sm text-muted-foreground">—</span>)}
                      </TableCell>
                      {canCorrect ? (<TableCell className="text-right">
                          <Button size="icon-xs" variant="ghost" aria-label={`Correct attendance for ${record.memberName ?? "member"}`} onClick={() => setEditing(record)}>
                            <PencilIcon />
                          </Button>
                        </TableCell>) : null}
                    </TableRow>))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-0 flex flex-col gap-3 border-t px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-xs text-muted-foreground">
                Showing {firstRow}–{lastRow} of {formatNumberIN(total)}{" "}
                {total === 1 ? "visit" : "visits"}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1 || list.loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                  <ChevronLeftIcon /> Previous
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  Page {Math.min(page, totalPages)} of {totalPages}
                </span>
                <Button size="sm" variant="outline" disabled={page >= totalPages || list.loading} onClick={() => setPage((value) => value + 1)}>
                  Next <ChevronRightIcon />
                </Button>
              </div>
            </div>
          </>)}
      </Card>

      <AttendanceCorrectionDialog record={editing} open={editing !== null} onOpenChange={(open) => {
            if (!open)
                setEditing(null);
        }} onSaved={() => {
            list.reload();
            summary.reload();
        }}/>
    </div>);
}

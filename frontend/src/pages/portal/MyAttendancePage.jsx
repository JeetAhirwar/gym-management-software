import { CalendarCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/States";
import { useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { formatDateTime, titleCase } from "@/lib/format";
export function MyAttendancePage() {
    const data = useData();
    const attendance = useAsync(() => data.listMyAttendance(50), [data]);
    const rows = attendance.data ?? [];
    return (<div className="space-y-6">
      <PageHeader title="My attendance" description="Your most recent gym visits (up to 50)."/>

      <Card className="graphite-surface gap-0 border-border/70 py-0">
        {attendance.loading && !attendance.data ? (<TableSkeleton rows={6} cols={5}/>) : attendance.error ? (<div className="p-4">
            <ErrorState title="Unable to load your visits" message={attendance.error} onRetry={attendance.reload}/>
          </div>) : rows.length === 0 ? (<div className="p-4">
            <EmptyState icon={<CalendarCheckIcon className="size-5"/>} title="No visits yet" description="Your check-ins will show up here after your first QR scan at the front desk." className="py-8"/>
          </div>) : (<Table>
            <TableHeader>
              <TableRow>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((record) => (<TableRow key={record.id}>
                  <TableCell className="text-sm">{formatDateTime(record.checkIn)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {record.checkOut ? formatDateTime(record.checkOut) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {titleCase(record.method)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={record.status === "checked_out"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-primary/30 bg-primary/10 text-primary"}>
                      {record.status === "checked_out" ? "Checked out" : "In gym"}
                    </Badge>
                  </TableCell>
                </TableRow>))}
            </TableBody>
          </Table>)}
      </Card>
    </div>);
}

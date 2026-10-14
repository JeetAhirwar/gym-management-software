import { ReceiptIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/shared/States";
import { PaymentBadge } from "@/components/shared/StatusBadge";
import { useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { formatDate, formatINR, PAYMENT_METHOD_LABELS } from "@/lib/format";
export function MyPaymentsPage() {
    const data = useData();
    const payments = useAsync(() => data.listMyPayments(), [data]);
    const rows = payments.data ?? [];
    return (<div className="space-y-6">
      <PageHeader title="My payments" description="Every payment recorded against your membership."/>

      <Card className="graphite-surface gap-0 border-border/70 py-0">
        {payments.loading && !payments.data ? (<TableSkeleton rows={5} cols={5}/>) : payments.error ? (<div className="p-4">
            <ErrorState title="Unable to load your payments" message={payments.error} onRetry={payments.reload}/>
          </div>) : rows.length === 0 ? (<div className="p-4">
            <EmptyState icon={<ReceiptIcon className="size-5"/>} title="No payments yet" description="Payments made at the front desk will appear here with their receipt numbers." className="py-8"/>
          </div>) : (<Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Method</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((payment) => (<TableRow key={payment.id}>
                  <TableCell>
                    <p className="text-sm font-medium">{payment.receiptNo}</p>
                    {payment.membershipSummary ? (<p className="text-xs text-muted-foreground">{payment.membershipSummary}</p>) : null}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(payment.paymentDate)}</TableCell>
                  <TableCell className="text-sm font-medium tabular">
                    {formatINR(payment.amount)}
                  </TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">
                    {PAYMENT_METHOD_LABELS[payment.method]}
                  </TableCell>
                  <TableCell>
                    <PaymentBadge status={payment.status}/>
                  </TableCell>
                </TableRow>))}
            </TableBody>
          </Table>)}
      </Card>
    </div>);
}

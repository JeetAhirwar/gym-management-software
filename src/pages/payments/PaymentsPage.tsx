import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  IndianRupeeIcon,
  PlusIcon,
  ReceiptIcon,
  RefreshCwIcon,
  SearchIcon,
  Undo2Icon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  EmptyState,
  ErrorState,
  SearchEmptyState,
  Skeleton,
  Stagger,
  TableSkeleton,
} from "@/components/shared/States";
import { PaymentBadge } from "@/components/shared/StatusBadge";
import { SmartImage } from "@/components/shared/SmartImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync, useDebounced } from "@/hooks";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  formatDate,
  formatINR,
  formatNumberIN,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { DuesRow, PaymentMethod, PaymentRecord, PaymentStatus } from "@/types";
import { PaymentRecordDialog } from "./PaymentRecordDialog";
import { ReceiptDialog } from "./ReceiptDialog";
import { RefundDialog } from "./RefundDialog";

const PAGE_SIZE = 15;

const STATUS_OPTIONS: Array<PaymentStatus | "all"> = [
  "all",
  ...(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]),
];

const METHOD_OPTIONS: Array<PaymentMethod | "all"> = [
  "all",
  ...(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]),
];

function StatCard({
  label,
  value,
  display,
  icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  display?: string;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-primary"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="graphite-surface border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
          <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            {icon}
          </span>
        </div>
        <p className={cn("mt-4 text-3xl font-semibold tracking-tight tabular", toneClass)}>
          {display ?? formatNumberIN(value)}
        </p>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCwIcon className="size-4" /> Retry
      </Button>
    </div>
  );
}

export function PaymentsPage() {
  const data = useData();
  const { session } = useAuth();
  const role = session?.profile.role;
  const canRecord = can(role, "payments.record");
  const canRefund = can(role, "payments.refund");
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [method, setMethod] = useState<PaymentMethod | "all">("all");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounced(search, 300);

  const [recordOpen, setRecordOpen] = useState(false);
  const [preset, setPreset] = useState<{ memberId: string; membershipId: string | null; amount: number } | null>(null);
  const [receiptFor, setReceiptFor] = useState<PaymentRecord | null>(null);
  const [refunding, setRefunding] = useState<PaymentRecord | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, status, method]);

  const revenue = useAsync(() => data.getRevenueSummary(6), [data]);
  const dues = useAsync(() => data.getDues(), [data]);
  const gym = useAsync(() => data.getGym(), [data]);
  const members = useAsync(() => data.listAllMembers(), [data], { enabled: canRecord });

  const payments = useAsync(
    () =>
      data.listPayments({
        search: debouncedSearch.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        status,
        method,
        page,
        pageSize: PAGE_SIZE,
      }),
    [data, debouncedSearch, from, to, status, method, page],
  );

  // Clamp the page when the filtered total shrinks below the current page.
  useEffect(() => {
    if (!payments.data) return;
    const pages = Math.max(1, Math.ceil(payments.data.total / payments.data.pageSize));
    if (payments.data.page > pages) setPage(pages);
  }, [payments.data]);

  const reloadAll = useCallback(() => {
    payments.reload();
    dues.reload();
    revenue.reload();
  }, [payments, dues, revenue]);

  // Auto-open the record dialog when arriving from /payments?new=1 (dashboard link).
  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      },
      { replace: true },
    );
    if (canRecord) {
      setPreset(null);
      setRecordOpen(true);
    }
  }, [searchParams, canRecord, setSearchParams]);

  const months = revenue.data ?? [];
  const latest = months.length > 0 ? months[months.length - 1] : null;
  const duesRows = dues.data ?? [];
  const totalOutstanding = duesRows.reduce((sum, row) => sum + row.balance, 0);
  const duesCount = duesRows.length;

  const statsLoading = revenue.loading || dues.loading;
  const statsError = revenue.error ?? dues.error;
  const retryStats = () => {
    if (revenue.error) revenue.reload();
    if (dues.error) dues.reload();
  };

  const items = payments.data?.items ?? [];
  const total = payments.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const filtersActive = Boolean(
    debouncedSearch.trim() || from || to || status !== "all" || method !== "all",
  );

  const refundableRemaining = useCallback(
    (payment: PaymentRecord): number => {
      const refunded = items
        .filter((row) => row.refundOf === payment.id && row.status === "refunded")
        .reduce((sum, row) => sum + row.amount, 0);
      return Math.max(0, payment.amount - refunded);
    },
    [items],
  );

  const openRecord = () => {
    setPreset(null);
    setRecordOpen(true);
  };

  const openRecordForDue = (row: DuesRow) => {
    setPreset({ memberId: row.memberId, membershipId: row.membershipId, amount: row.balance });
    setRecordOpen(true);
  };

  const clearFilters = () => {
    setSearch("");
    setFrom("");
    setTo("");
    setStatus("all");
    setMethod("all");
  };

  const exportPayments = () => {
    if (items.length === 0) return;
    downloadCsv(
      `payments-page-${page}`,
      toCsv(items, [
        { header: "Receipt no", accessor: (row) => row.receiptNo },
        { header: "Member", accessor: (row) => row.memberName },
        { header: "Member ID", accessor: (row) => row.memberCode },
        { header: "Amount", accessor: (row) => row.amount },
        { header: "Method", accessor: (row) => PAYMENT_METHOD_LABELS[row.method] },
        { header: "Status", accessor: (row) => PAYMENT_STATUS_LABELS[row.status] },
        { header: "Date", accessor: (row) => row.paymentDate },
        { header: "Transaction ref", accessor: (row) => row.transactionRef },
        { header: "Notes", accessor: (row) => row.notes },
      ]),
    );
  };

  const header = (
    <PageHeader
      title="Payments & fees"
      description="Record fee payments, track outstanding dues and print receipts."
      actions={
        canRecord ? (
          <Button onClick={openRecord}>
            <PlusIcon className="size-4" /> Record payment
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className="space-y-6">
      {header}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32" />)
        ) : statsError ? (
          <div className="sm:col-span-2 xl:col-span-4">
            <ErrorState title="Unable to load the revenue numbers" message={statsError} onRetry={retryStats} />
          </div>
        ) : (
          <>
            <Stagger delayIndex={0}>
              <StatCard
                label="Collected this month"
                value={latest?.collected ?? 0}
                display={formatINR(latest?.collected ?? 0)}
                icon={<IndianRupeeIcon className="size-4" />}
                hint={latest ? `In ${latest.label}` : "No months on record yet"}
                tone="success"
              />
            </Stagger>
            <Stagger delayIndex={1}>
              <StatCard
                label="Outstanding this month"
                value={latest?.outstanding ?? 0}
                display={formatINR(latest?.outstanding ?? 0)}
                icon={<WalletIcon className="size-4" />}
                hint={latest ? `Expected ${formatINR(latest.expected)} in ${latest.label}` : "No months on record yet"}
                tone={(latest?.outstanding ?? 0) > 0 ? "warning" : "default"}
              />
            </Stagger>
            <Stagger delayIndex={2}>
              <StatCard
                label="Payments this month"
                value={latest?.count ?? 0}
                icon={<ReceiptIcon className="size-4" />}
                hint={latest ? `Transactions in ${latest.label}` : "No months on record yet"}
              />
            </Stagger>
            <Stagger delayIndex={3}>
              <StatCard
                label="Outstanding dues"
                value={totalOutstanding}
                display={formatINR(totalOutstanding)}
                icon={<UsersIcon className="size-4" />}
                hint={`${duesCount} ${duesCount === 1 ? "member owes" : "members owe"} an open balance`}
                tone={totalOutstanding > 0 ? "danger" : "default"}
              />
            </Stagger>
          </>
        )}
      </div>

      {/* Dues */}
      <Card className="graphite-surface border-border/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Outstanding dues</CardTitle>
            <p className="text-xs text-muted-foreground">
              Members with an open balance on their current membership
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Refresh dues" onClick={dues.reload}>
            <RefreshCwIcon className="size-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {dues.loading ? (
            <TableSkeleton rows={4} cols={6} />
          ) : dues.error ? (
            <SectionError message={dues.error} onRetry={dues.reload} />
          ) : duesRows.length === 0 ? (
            <EmptyState
              title="No outstanding dues"
              description="Every active membership is fully paid up."
              className="py-8"
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Ends</TableHead>
                    <TableHead className="text-right">Billed</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duesRows.map((row) => (
                    <TableRow key={row.membershipId}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <SmartImage src={null} name={row.memberName} className="size-8 shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.memberName}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{row.memberCode}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-40 truncate">{row.planName}</TableCell>
                      <TableCell>{formatDate(row.endDate)}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(row.billed)}</TableCell>
                      <TableCell className="text-right tabular">{formatINR(row.paid)}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular",
                          row.balance > 0 && "text-warning",
                        )}
                      >
                        {formatINR(row.balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canRecord ? (
                          <Button variant="outline" size="xs" onClick={() => openRecordForDue(row)}>
                            <IndianRupeeIcon className="size-3" /> Record payment
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payments list */}
      <Card className="graphite-surface border-border/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Payments</CardTitle>
            <p className="text-xs text-muted-foreground">
              {payments.loading ? "Loading…" : `${formatNumberIN(total)} ${total === 1 ? "record" : "records"} matched`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPayments}
            disabled={items.length === 0}
          >
            <DownloadIcon className="size-4" /> CSV
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search member, member ID or receipt no."
                aria-label="Search payments"
                className="pl-9"
              />
            </div>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="From date"
              className="w-auto"
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="To date"
              className="w-auto"
            />
            <Select value={status} onValueChange={(value) => setStatus(value as PaymentStatus | "all")}>
              <SelectTrigger size="sm" className="w-auto" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All statuses" : PAYMENT_STATUS_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod | "all")}>
              <SelectTrigger size="sm" className="w-auto" aria-label="Filter by method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option === "all" ? "All methods" : PAYMENT_METHOD_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtersActive ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            ) : null}
          </div>

          {/* Table / states */}
          {payments.loading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : payments.error ? (
            <ErrorState title="Unable to load payments" message={payments.error} onRetry={payments.reload} />
          ) : items.length === 0 ? (
            filtersActive ? (
              <SearchEmptyState query={debouncedSearch.trim() || undefined} />
            ) : (
              <EmptyState
                icon={<ReceiptIcon className="size-5" />}
                title="No payments yet"
                description="Record your first payment to start tracking revenue and receipts."
                action={
                  canRecord ? (
                    <Button size="sm" onClick={openRecord}>
                      <PlusIcon className="size-4" /> Record payment
                    </Button>
                  ) : undefined
                }
              />
            )
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((payment) => {
                    const remaining = refundableRemaining(payment);
                    const showRefund =
                      canRefund &&
                      payment.refundOf === null &&
                      (payment.status === "paid" || payment.status === "partial") &&
                      remaining > 0;
                    return (
                      <TableRow key={payment.id}>
                        <TableCell className="font-mono text-xs">{payment.receiptNo}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <SmartImage src={null} name={payment.memberName ?? "Member"} className="size-8 shrink-0" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{payment.memberName ?? "Member"}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                <span className="font-mono">{payment.memberCode}</span>
                                {payment.membershipSummary ? ` · ${payment.membershipSummary}` : ""}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular">
                          {formatINR(payment.amount)}
                          {payment.refundOf ? (
                            <span className="ml-1 text-xs font-normal text-muted-foreground">refund</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[payment.method]}</TableCell>
                        <TableCell>
                          <PaymentBadge status={payment.status} />
                        </TableCell>
                        <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`View receipt ${payment.receiptNo}`}
                              title="View receipt"
                              onClick={() => setReceiptFor(payment)}
                            >
                              <ReceiptIcon />
                            </Button>
                            {showRefund ? (
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`Refund receipt ${payment.receiptNo}`}
                                title="Refund…"
                                onClick={() => setRefunding(payment)}
                              >
                                <Undo2Icon />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {formatNumberIN(total)} payments
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || payments.loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeftIcon className="size-4" /> Prev
                </Button>
                <span className="text-xs text-muted-foreground tabular">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || payments.loading}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PaymentRecordDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        members={members.data ?? []}
        preset={preset}
        onSaved={reloadAll}
      />
      <ReceiptDialog
        payment={receiptFor}
        gym={gym.data ?? session?.gym ?? null}
        onOpenChange={(open) => {
          if (!open) setReceiptFor(null);
        }}
      />
      <RefundDialog
        payment={refunding}
        remaining={refunding ? refundableRemaining(refunding) : 0}
        onOpenChange={(open) => {
          if (!open) setRefunding(null);
        }}
        onSaved={reloadAll}
      />
    </div>
  );
}

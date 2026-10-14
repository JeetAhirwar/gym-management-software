import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, MoreHorizontalIcon, PencilIcon, PhoneIcon, PlusIcon, SearchIcon, Trash2Icon, UserCheckIcon, UserRoundPlusIcon, UserXIcon, UsersIcon, } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, SearchEmptyState, TableSkeleton, Stagger } from "@/components/shared/States";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SmartImage } from "@/components/shared/SmartImage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync, useDebounced } from "@/hooks";
import { MEMBER_FILTER_LABELS, formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { MemberFormDialog } from "./MemberFormDialog";
import { ConfirmActionDialog } from "./ConfirmActionDialog";
const PAGE_SIZE = 10;
const STATUS_FILTERS = [
    "all",
    "active",
    "expiring_soon",
    "expired",
    "suspended",
    "inactive",
];
const SORT_OPTIONS = [
    { value: "created", label: "Recently added" },
    { value: "name", label: "Name" },
    { value: "joined", label: "Join date" },
    { value: "expiry", label: "Expiry date" },
];
function DaysLeftCell({ member }) {
    if (member.daysRemaining === null) {
        return <span className="text-muted-foreground">—</span>;
    }
    if (member.daysRemaining <= 0) {
        return <span className="text-destructive">Ended</span>;
    }
    return <span className="tabular">{member.daysRemaining} days</span>;
}
export function MembersPage() {
    const data = useData();
    const { session } = useAuth();
    const role = session?.profile.role;
    const canCreate = can(role, "members.create");
    const canEdit = can(role, "members.edit");
    const canDelete = can(role, "members.delete");
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState("");
    const debouncedSearch = useDebounced(search, 350);
    const [status, setStatus] = useState("all");
    const [planId, setPlanId] = useState("all");
    const [sort, setSort] = useState("created");
    const [dir, setDir] = useState("desc");
    const [page, setPage] = useState(1);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const plans = useAsync(() => data.listPlans(), [data]);
    const members = useAsync(() => data.listMembers({
        search: debouncedSearch.trim() || undefined,
        status,
        planId: planId === "all" ? undefined : planId,
        sort,
        dir,
        page,
        pageSize: PAGE_SIZE,
    }), [data, debouncedSearch, status, planId, sort, dir, page]);
    // Reset to the first page whenever the filters change.
    useEffect(() => {
        setPage(1);
    }, [debouncedSearch, status, planId, sort, dir]);
    // Deep link: /members?new=1 auto-opens the add dialog (dashboard quick action).
    useEffect(() => {
        if (searchParams.get("new") !== "1")
            return;
        if (canCreate) {
            setEditing(null);
            setFormOpen(true);
        }
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams, canCreate]);
    const hasFilters = debouncedSearch.trim() !== "" || status !== "all" || planId !== "all";
    const clearFilters = () => {
        setSearch("");
        setStatus("all");
        setPlanId("all");
        setSort("created");
        setDir("desc");
    };
    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (member) => {
        setEditing(member);
        setFormOpen(true);
    };
    const handleSave = async (payload) => {
        try {
            if (payload.mode === "create") {
                await data.createMember(payload.input);
                toast.success(`${payload.input.fullName} added`);
            }
            else if (editing) {
                await data.updateMember(editing.id, payload.input);
                toast.success(`${payload.input.fullName ?? editing.fullName} updated`);
            }
            members.reload();
            return true;
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save this member.");
            return false;
        }
    };
    const handleToggleStatus = async (member) => {
        const next = member.status === "active" ? "inactive" : "active";
        try {
            await data.setMemberStatus(member.id, next);
            toast.success(next === "active" ? `${member.fullName} reactivated` : `${member.fullName} deactivated`);
            members.reload();
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to change the member status.");
        }
    };
    const handleDelete = async () => {
        if (!deleting)
            return false;
        try {
            await data.deleteMember(deleting.id);
            toast.success(`${deleting.fullName} deleted`);
            members.reload();
            return true;
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete this member.");
            return false;
        }
    };
    const rows = members.data?.items ?? [];
    const total = members.data?.total ?? 0;
    const currentPage = members.data?.page ?? page;
    const pageSize = members.data?.pageSize ?? PAGE_SIZE;
    const rangeFrom = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const rangeTo = Math.min(total, currentPage * pageSize);
    const header = (<PageHeader title="Members" description="Your member directory — memberships, QR cards and payment history in one place." actions={canCreate ? (<Button onClick={openCreate}>
            <PlusIcon className="size-4"/> Add member
          </Button>) : null}/>);
    return (<div className="space-y-6">
      {header}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"/>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or member ID…" className="pl-9" aria-label="Search members"/>
        </div>

        <Select value={status} onValueChange={(value) => setStatus(value)}>
          <SelectTrigger size="sm" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((option) => (<SelectItem key={option} value={option}>
                {MEMBER_FILTER_LABELS[option]}
              </SelectItem>))}
          </SelectContent>
        </Select>

        <Select value={planId} onValueChange={setPlanId}>
          <SelectTrigger size="sm" aria-label="Filter by plan">
            <SelectValue placeholder="All plans"/>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {(plans.data ?? []).map((plan) => (<SelectItem key={plan.id} value={plan.id}>
                {plan.name}
              </SelectItem>))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(value) => setSort(value)}>
          <SelectTrigger size="sm" aria-label="Sort members">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (<SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="icon-sm" aria-label={dir === "asc" ? "Sort ascending (switch to descending)" : "Sort descending (switch to ascending)"} onClick={() => setDir((current) => (current === "asc" ? "desc" : "asc"))}>
          {dir === "asc" ? <ArrowUpIcon className="size-4"/> : <ArrowDownIcon className="size-4"/>}
        </Button>

        {hasFilters ? (<Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>) : null}
      </div>

      {/* Table */}
      <Stagger>
        <Card className="graphite-surface gap-0 overflow-hidden border-border/70 py-0">
          {members.error ? (<div className="p-4">
              <ErrorState title="Unable to load members" message={members.error} onRetry={members.reload}/>
            </div>) : members.loading && !members.data ? (<TableSkeleton rows={6} cols={5}/>) : rows.length === 0 ? (<div className="p-4">
              {hasFilters ? (<SearchEmptyState query={debouncedSearch.trim()}/>) : (<EmptyState icon={<UsersIcon className="size-5"/>} title="No members yet" description="Add your first member — their QR membership card is generated automatically." action={canCreate ? (<Button size="sm" onClick={openCreate}>
                        <UserRoundPlusIcon className="size-4"/> Add member
                      </Button>) : undefined}/>)}
            </div>) : (<>
              <div className={cn("transition-opacity", members.loading && "pointer-events-none opacity-60")}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56">Member</TableHead>
                      <TableHead className="hidden sm:table-cell">Phone</TableHead>
                      <TableHead className="hidden md:table-cell">Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Days left</TableHead>
                      <TableHead className="w-10 text-right">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((member) => (<TableRow key={member.id} className="cursor-pointer" onClick={() => navigate(`/members/${member.id}`)}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <SmartImage src={member.photoUrl} name={member.fullName} className="size-9 shrink-0"/>
                            <div className="min-w-0">
                              <Link to={`/members/${member.id}`} onClick={(event) => event.stopPropagation()} className="block truncate text-sm font-medium hover:underline">
                                {member.fullName}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">{member.memberCode}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <PhoneIcon className="size-3.5"/>
                            {member.phone}
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {member.planName ? (<div>
                              <p className="text-sm">{member.planName}</p>
                              <p className="text-xs text-muted-foreground">ends {formatDate(member.endDate)}</p>
                            </div>) : (<span className="text-muted-foreground">—</span>)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={member.effectiveStatus}/>
                        </TableCell>
                        <TableCell className="hidden text-sm lg:table-cell">
                          <DaysLeftCell member={member}/>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${member.fullName}`} onClick={(event) => event.stopPropagation()}>
                                <MoreHorizontalIcon />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                              <DropdownMenuItem onSelect={() => navigate(`/members/${member.id}`)}>
                                <EyeIcon /> View profile
                              </DropdownMenuItem>
                              {canEdit ? (<>
                                  <DropdownMenuItem onSelect={() => openEdit(member)}>
                                    <PencilIcon /> Edit member
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => void handleToggleStatus(member)}>
                                    {member.status === "active" ? <UserXIcon /> : <UserCheckIcon />}
                                    {member.status === "active" ? "Deactivate" : "Activate"}
                                  </DropdownMenuItem>
                                </>) : null}
                              {canDelete ? (<>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(member)}>
                                    <Trash2Icon /> Delete member
                                  </DropdownMenuItem>
                                </>) : null}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Showing {rangeFrom}–{rangeTo} of {total} {total === 1 ? "member" : "members"}
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1 || members.loading} onClick={() => setPage(currentPage - 1)}>
                    <ChevronLeftIcon className="size-4"/> Prev
                  </Button>
                  <Button variant="outline" size="sm" disabled={rangeTo >= total || members.loading} onClick={() => setPage(currentPage + 1)}>
                    Next <ChevronRightIcon className="size-4"/>
                  </Button>
                </div>
              </div>
            </>)}
        </Card>
      </Stagger>

      <MemberFormDialog open={formOpen} onOpenChange={setFormOpen} member={editing} plans={plans.data ?? []} onSave={handleSave}/>

      <ConfirmActionDialog open={deleting !== null} onOpenChange={(open) => {
            if (!open)
                setDeleting(null);
        }} icon={Trash2Icon} title={`Delete ${deleting?.fullName ?? "member"}?`} description="This permanently removes the member, their memberships, attendance and payment records. This action cannot be undone." cancelLabel="Keep member" confirmLabel="Delete member" onConfirm={handleDelete}/>
    </div>);
}

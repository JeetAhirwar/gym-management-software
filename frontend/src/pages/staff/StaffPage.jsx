import { useState } from "react";
import { toast } from "sonner";
import { ArchiveIcon, PencilIcon, PlusIcon, UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton, Stagger } from "@/components/shared/States";
import { SmartImage } from "@/components/shared/SmartImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { formatDate } from "@/lib/format";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { ArchiveStaffDialog } from "./ArchiveStaffDialog";
import { StaffFormDialog } from "./StaffFormDialog";
const EMPLOYMENT_LABELS = {
    active: "Active",
    on_leave: "On leave",
    resigned: "Resigned",
};
const EMPLOYMENT_STYLES = {
    active: "border-primary/30 bg-primary/10 text-primary",
    on_leave: "border-warning/30 bg-warning/10 text-warning",
    resigned: "border-border bg-muted text-muted-foreground",
};
export function StaffPage() {
    const data = useData();
    const { session } = useAuth();
    const role = session?.profile.role;
    const canManage = can(role, "staff.manage");
    const [includeInactive, setIncludeInactive] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [archiving, setArchiving] = useState(null);
    const staff = useAsync(() => data.listStaff(includeInactive), [data, includeInactive]);
    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };
    const openEdit = (member) => {
        setEditing(member);
        setFormOpen(true);
    };
    const handleSave = async (input) => {
        try {
            if (editing) {
                await data.updateStaff(editing.id, input);
                toast.success(`${input.fullName} updated`);
            }
            else {
                await data.createStaff(input);
                toast.success(`${input.fullName} added to the team`);
            }
            staff.reload();
            return true;
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save the staff member.");
            return false;
        }
    };
    const handleArchive = async () => {
        if (!archiving)
            return false;
        try {
            await data.archiveStaff(archiving.id);
            toast.success(`${archiving.fullName} archived`);
            staff.reload();
            return true;
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to archive this staff member.");
            return false;
        }
    };
    const header = (<PageHeader title="Trainers & staff" description="Everyone who runs the floor — admins, front desk and trainers." actions={<>
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card/60 px-3 py-1.5">
            <Label htmlFor="staff-inactive" className="text-xs text-muted-foreground">
              Include inactive
            </Label>
            <Switch id="staff-inactive" size="sm" checked={includeInactive} onCheckedChange={setIncludeInactive}/>
          </div>
          {canManage ? (<Button onClick={openCreate}>
              <PlusIcon className="size-4"/> Add staff
            </Button>) : null}
        </>}/>);
    if (staff.loading) {
        return (<div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (<Skeleton key={index} className="h-48"/>))}
        </div>
      </div>);
    }
    if (staff.error) {
        return (<div className="space-y-6">
        {header}
        <ErrorState title="Unable to load staff" message={staff.error} onRetry={staff.reload}/>
      </div>);
    }
    const rows = staff.data ?? [];
    return (<div className="space-y-6">
      {header}

      {rows.length === 0 ? (<EmptyState icon={<UsersIcon className="size-5"/>} title={includeInactive ? "No staff yet" : "No active staff"} description={includeInactive
                ? "Add your first team member to assign classes and share the front desk."
                : "Turn on “Include inactive” to see on-leave and resigned staff."} action={canManage ? (<Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4"/> Add staff
              </Button>) : undefined}/>) : (<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((member, index) => (<Stagger key={member.id} className="h-full" delayIndex={index}>
              <Card className="graphite-surface h-full border-border/70">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-start gap-3">
                    <SmartImage src={member.photoUrl} name={member.fullName} className="size-12 shrink-0"/>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{member.fullName}</p>
                        <Badge variant="outline" className="shrink-0">
                          {ROLE_LABELS[member.role]}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email ?? "No email"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{member.phone ?? "—"}</p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={EMPLOYMENT_STYLES[member.employmentStatus]}>
                      {EMPLOYMENT_LABELS[member.employmentStatus]}
                    </Badge>
                    {member.specialization ? (<Badge variant="secondary" className="max-w-full truncate">
                        {member.specialization}
                      </Badge>) : null}
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <p className="text-xs text-muted-foreground">Joined {formatDate(member.joiningDate)}</p>
                    {canManage ? (<div className="flex items-center gap-1">
                        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${member.fullName}`} onClick={() => openEdit(member)}>
                          <PencilIcon />
                        </Button>
                        {member.employmentStatus !== "resigned" ? (<Button size="icon-xs" variant="ghost" aria-label={`Archive ${member.fullName}`} onClick={() => setArchiving(member)}>
                            <ArchiveIcon />
                          </Button>) : null}
                      </div>) : null}
                  </div>
                </CardContent>
              </Card>
            </Stagger>))}
        </div>)}

      <p className="text-xs text-muted-foreground">
        {rows.length} {rows.length === 1 ? "person" : "people"} on record
      </p>

      <StaffFormDialog open={formOpen} onOpenChange={setFormOpen} staff={editing} onSave={handleSave}/>
      <ArchiveStaffDialog staff={archiving} onOpenChange={(open) => {
            if (!open)
                setArchiving(null);
        }} onConfirm={handleArchive}/>
    </div>);
}

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addDays, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  XCircleIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton, Stagger } from "@/components/shared/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { endOfDayInTz, isSameYmd, startOfDayInTz, ymdInTz } from "@/lib/datetime";
import { formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { ClassCreateInput } from "@/data/types";
import type { ClassStatus, GymClass } from "@/types";
import { ClassFormDialog } from "./ClassFormDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { ManageEnrollmentsDialog } from "./ManageEnrollmentsDialog";

const CLASS_STATUS: Record<ClassStatus, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "border-info/30 bg-info/10 text-info" },
  completed: { label: "Completed", className: "border-primary/30 bg-primary/10 text-primary" },
  cancelled: { label: "Cancelled", className: "border-border bg-muted text-muted-foreground" },
};

function ClassCard({
  gymClass,
  canManage,
  onEdit,
  onEnrolments,
  onCancel,
}: {
  gymClass: GymClass;
  canManage: boolean;
  onEdit: (gymClass: GymClass) => void;
  onEnrolments: (gymClass: GymClass) => void;
  onCancel: (gymClass: GymClass) => void;
}) {
  const enrolled = gymClass.enrolledCount ?? 0;
  const percent =
    gymClass.capacity > 0 ? Math.min(100, Math.round((enrolled / gymClass.capacity) * 100)) : 0;
  const full = enrolled >= gymClass.capacity;
  const isCancelled = gymClass.status === "cancelled";
  const status = CLASS_STATUS[gymClass.status];

  return (
    <Card
      className={cn(
        "graphite-surface border-border/70",
        isCancelled && "opacity-60",
      )}
    >
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm font-semibold tabular">
            {formatTime(gymClass.startsAt)}
            <span className="text-xs font-normal text-muted-foreground">
              {gymClass.durationMinutes} min
            </span>
          </span>
          <Badge variant="outline" className={status.className}>
            {status.label}
          </Badge>
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{gymClass.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {gymClass.trainerName ?? "No trainer assigned"}
          </p>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {enrolled}/{gymClass.capacity} enrolled
            </span>
            <span className={full ? "font-medium text-warning" : undefined}>
              {full ? "Full" : `${percent}%`}
            </span>
          </div>
          <Progress value={percent} className="h-1.5" />
        </div>

        {canManage && !isCancelled ? (
          <div className="flex items-center gap-1 border-t border-border/60 pt-2">
            <Button size="xs" variant="ghost" onClick={() => onEnrolments(gymClass)}>
              <Settings2Icon /> Enrolments
            </Button>
            <span className="ml-auto flex items-center">
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Edit ${gymClass.name}`}
                onClick={() => onEdit(gymClass)}
              >
                <PencilIcon />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Cancel ${gymClass.name}`}
                onClick={() => onCancel(gymClass)}
              >
                <XCircleIcon />
              </Button>
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function ClassesPage() {
  const data = useData();
  const { session } = useAuth();
  const canManage = can(session?.profile.role, "classes.manage");

  const [weekOffset, setWeekOffset] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GymClass | null>(null);
  const [managing, setManaging] = useState<GymClass | null>(null);
  const [cancelling, setCancelling] = useState<GymClass | null>(null);

  const rangeStart = useMemo(
    () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
    [weekOffset],
  );
  const rangeEnd = useMemo(() => endOfWeek(rangeStart, { weekStartsOn: 1 }), [rangeStart]);
  const from = useMemo(() => startOfDayInTz(rangeStart), [rangeStart]);
  const to = useMemo(() => endOfDayInTz(rangeEnd), [rangeEnd]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(rangeStart, index)),
    [rangeStart],
  );

  const classes = useAsync(() => data.listClasses(from, to), [data, from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, GymClass[]>();
    for (const day of days) map.set(ymdInTz(day), []);
    for (const gymClass of classes.data ?? []) {
      const key = ymdInTz(new Date(gymClass.startsAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(gymClass);
    }
    return map;
  }, [days, classes.data]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleSave = async (input: ClassCreateInput): Promise<boolean> => {
    try {
      if (editing) {
        await data.updateClass(editing.id, input);
        toast.success("Class updated");
      } else {
        await data.createClass(input);
        toast.success(`${input.name} scheduled`);
      }
      classes.reload();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save the class.");
      return false;
    }
  };

  const handleCancelClass = async (): Promise<boolean> => {
    if (!cancelling) return false;
    try {
      await data.cancelClass(cancelling.id);
      toast.success(`${cancelling.name} cancelled`);
      classes.reload();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to cancel this class.");
      return false;
    }
  };

  const total = classes.data?.length ?? 0;
  const rangeLabel = `${format(rangeStart, "d MMM")} – ${format(rangeEnd, "d MMM yyyy")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes & schedule"
        description="Plan the week, watch capacity and manage who is booked in."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <PlusIcon className="size-4" /> New class
            </Button>
          ) : undefined
        }
      />

      {/* Week navigator */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Previous week"
            onClick={() => setWeekOffset((offset) => offset - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="sm"
            variant={weekOffset === 0 ? "default" : "outline"}
            onClick={() => setWeekOffset(0)}
          >
            Today
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Next week"
            onClick={() => setWeekOffset((offset) => offset + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarDaysIcon className="size-4 text-muted-foreground" />
          {rangeLabel}
        </p>
        <p className="text-xs text-muted-foreground">
          {total} {total === 1 ? "class" : "classes"} this week
        </p>
      </div>

      {classes.loading ? (
        <div className="flex flex-col gap-3 md:flex-row md:overflow-x-auto md:pb-2">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="space-y-3 md:w-64 md:shrink-0">
              <Skeleton className="h-12" />
              <Skeleton className="h-36" />
            </div>
          ))}
        </div>
      ) : classes.error ? (
        <ErrorState
          title="Unable to load the schedule"
          message={classes.error}
          onRetry={classes.reload}
        />
      ) : total === 0 ? (
        <EmptyState
          icon={<CalendarDaysIcon className="size-5" />}
          title="Nothing scheduled this week"
          description={
            canManage
              ? "Jump to another week or schedule a new class to fill the calendar."
              : "No classes are scheduled for this week yet."
          }
          action={
            canManage ? (
              <Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4" /> New class
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:overflow-x-auto md:pb-2">
          {days.map((day) => {
            const key = ymdInTz(day);
            const dayClasses = byDay.get(key) ?? [];
            const isToday = isSameYmd(new Date(), day);
            return (
              <div key={key} className="flex flex-col gap-3 md:w-64 md:shrink-0">
                <div
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2",
                    isToday
                      ? "border-primary/40 bg-primary/10"
                      : "border-border/70 bg-card/60",
                  )}
                >
                  <div>
                    <p
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        isToday ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {format(day, "EEE")}
                    </p>
                    <p className="text-sm text-muted-foreground">{format(day, "d MMM")}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{dayClasses.length}</span>
                </div>

                {dayClasses.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-xs text-muted-foreground">
                    No classes
                  </div>
                ) : (
                  dayClasses.map((gymClass) => (
                    <Stagger key={gymClass.id}>
                      <ClassCard
                        gymClass={gymClass}
                        canManage={canManage}
                        onEdit={(item) => {
                          setEditing(item);
                          setFormOpen(true);
                        }}
                        onEnrolments={setManaging}
                        onCancel={setCancelling}
                      />
                    </Stagger>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      <ClassFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        gymClass={editing}
        onSave={handleSave}
      />
      <ManageEnrollmentsDialog
        gymClass={managing}
        open={managing !== null}
        onOpenChange={(open) => {
          if (!open) setManaging(null);
        }}
        canManage={canManage}
        onChanged={classes.reload}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        title={`Cancel ${cancelling?.name ?? "class"}?`}
        description="The class will be marked as cancelled and every active enrolment will be released. This cannot be undone from here."
        confirmLabel="Cancel class"
        onConfirm={handleCancelClass}
      />
    </div>
  );
}

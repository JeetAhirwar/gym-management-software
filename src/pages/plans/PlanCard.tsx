import { ArchiveIcon, ArchiveRestoreIcon, CheckIcon, PencilIcon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Stagger } from "@/components/shared/States";
import { durationLabel, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MembershipPlan } from "@/types";

export function PlanCard({
  plan,
  memberCount,
  canManage,
  index,
  onEdit,
  onToggle,
}: {
  plan: MembershipPlan;
  memberCount: number;
  canManage: boolean;
  index: number;
  onEdit: (plan: MembershipPlan) => void;
  onToggle: (plan: MembershipPlan) => void;
}) {
  const benefits = plan.benefits.filter((benefit) => benefit.trim().length > 0);

  return (
    <Stagger delayIndex={index} className="h-full">
      <Card className={cn("graphite-surface h-full border-border/70", !plan.isActive && "opacity-90")}>
        <CardContent className="flex h-full flex-col gap-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-tight">{plan.name}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <UsersIcon className="size-3.5" />
                {memberCount > 0
                  ? `${memberCount} active ${memberCount === 1 ? "member" : "members"}`
                  : "No active members"}
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "font-medium",
                plan.isActive
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              {plan.isActive ? "Active" : "Archived"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="tabular text-3xl font-semibold tracking-tight">{formatINR(plan.price)}</span>
            <span className="text-xs text-muted-foreground">
              per {durationLabel(plan.durationValue, plan.durationUnit)}
            </span>
          </div>

          {plan.description ? (
            <p className="text-sm text-muted-foreground">{plan.description}</p>
          ) : null}

          <ul className="space-y-1.5">
            {benefits.length === 0 ? (
              <li className="text-xs text-muted-foreground">No benefits listed for this plan yet.</li>
            ) : (
              benefits.map((benefit, benefitIndex) => (
                <li key={`${benefitIndex}-${benefit}`} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CheckIcon className="size-3" />
                  </span>
                  <span className="text-foreground/90">{benefit}</span>
                </li>
              ))
            )}
          </ul>

          {canManage ? (
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
              <Button variant="outline" size="sm" onClick={() => onEdit(plan)}>
                <PencilIcon className="size-3.5" /> Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onToggle(plan)}>
                {plan.isActive ? (
                  <>
                    <ArchiveIcon className="size-3.5" /> Archive
                  </>
                ) : (
                  <>
                    <ArchiveRestoreIcon className="size-3.5" /> Activate
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </Stagger>
  );
}

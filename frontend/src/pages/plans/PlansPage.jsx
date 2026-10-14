import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { PlusIcon, TagsIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/shared/States";
import { Button } from "@/components/ui/button";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync } from "@/hooks";
import { can } from "@/lib/permissions";
import { PlanCard } from "./PlanCard";
import { PlanDialog } from "./PlanDialog";
import { TogglePlanDialog } from "./TogglePlanDialog";
export function PlansPage() {
    const data = useData();
    const { session } = useAuth();
    const role = session?.profile.role;
    const canManage = can(role, "plans.manage");
    const [searchParams, setSearchParams] = useSearchParams();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [toggling, setToggling] = useState(null);
    const plans = useAsync(() => data.listPlans(true), [data]);
    const distribution = useAsync(() => data.getPlanDistribution(), [data]);
    const reloadAll = useCallback(() => {
        plans.reload();
        distribution.reload();
    }, [plans, distribution]);
    // Auto-open the "new plan" dialog when arriving from /plans?new=1 (dashboard link).
    useEffect(() => {
        if (searchParams.get("new") !== "1")
            return;
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete("new");
            return next;
        }, { replace: true });
        if (canManage) {
            setEditing(null);
            setDialogOpen(true);
        }
    }, [searchParams, canManage, setSearchParams]);
    const openCreate = () => {
        setEditing(null);
        setDialogOpen(true);
    };
    const openEdit = (plan) => {
        setEditing(plan);
        setDialogOpen(true);
    };
    const handleToggle = async () => {
        if (!toggling)
            return false;
        try {
            await data.archivePlan(toggling.id, !toggling.isActive);
            toast.success(toggling.isActive ? `${toggling.name} archived` : `${toggling.name} activated`);
            reloadAll();
            return true;
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update this plan.");
            return false;
        }
    };
    const rows = plans.data ?? [];
    const memberCounts = useMemo(() => {
        const map = new Map();
        for (const entry of distribution.data ?? [])
            map.set(entry.planId, entry.count);
        return map;
    }, [distribution.data]);
    const activeCount = rows.filter((plan) => plan.isActive).length;
    const header = (<PageHeader title="Membership plans" description="Pricing, durations and perks — what members see when they sign up." actions={canManage ? (<Button onClick={openCreate}>
            <PlusIcon className="size-4"/> Add plan
          </Button>) : undefined}/>);
    if (plans.loading) {
        return (<div className="space-y-6">
        {header}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (<Skeleton key={index} className="h-72"/>))}
        </div>
      </div>);
    }
    if (plans.error) {
        return (<div className="space-y-6">
        {header}
        <ErrorState title="Unable to load plans" message={plans.error} onRetry={plans.reload}/>
      </div>);
    }
    return (<div className="space-y-6">
      {header}

      {rows.length === 0 ? (<EmptyState icon={<TagsIcon className="size-5"/>} title="No plans yet" description="Create your first membership plan — set a price, a duration and the perks that come with it." action={canManage ? (<Button size="sm" onClick={openCreate}>
                <PlusIcon className="size-4"/> Add plan
              </Button>) : undefined}/>) : (<>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((plan, index) => (<PlanCard key={plan.id} plan={plan} memberCount={memberCounts.get(plan.id) ?? 0} canManage={canManage} index={index} onEdit={openEdit} onToggle={setToggling}/>))}
          </div>

          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? "plan" : "plans"} on record · {activeCount} active
          </p>
        </>)}

      <PlanDialog plan={editing} open={dialogOpen} onOpenChange={setDialogOpen} onSaved={reloadAll}/>
      <TogglePlanDialog plan={toggling} onOpenChange={(open) => {
            if (!open)
                setToggling(null);
        }} onConfirm={handleToggle}/>
    </div>);
}

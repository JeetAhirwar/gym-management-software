import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useData } from "@/auth/AuthProvider";
import { useSubmitGuard } from "@/hooks";
import { durationLabel } from "@/lib/format";
import { numericValue, planFormSchema, type PlanFormValues } from "@/lib/validation";
import type { DurationUnit, MembershipPlan } from "@/types";

const DURATION_UNITS: { value: DurationUnit; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

export function PlanDialog({
  plan,
  open,
  onOpenChange,
  onSaved,
}: {
  plan: MembershipPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const data = useData();
  const [submitting, run] = useSubmitGuard();

  const defaultValues: PlanFormValues = {
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    price: plan?.price ?? 0,
    durationValue: plan?.durationValue ?? 1,
    durationUnit: plan?.durationUnit ?? "month",
    benefits: (plan?.benefits ?? []).join("\n"),
    isActive: plan?.isActive ?? true,
  };

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PlanFormValues>({
    resolver: zodResolver(planFormSchema),
    defaultValues,
  });

  const durationValue = numericValue(watch("durationValue"), 1);
  const durationUnit = watch("durationUnit");
  const isActive = watch("isActive");

  const onSubmit = handleSubmit((values) => {
    const payload = {
      name: values.name,
      description: values.description?.trim() ? values.description.trim() : null,
      price: values.price,
      durationValue: values.durationValue,
      durationUnit: values.durationUnit,
      benefits: values.benefits
        ? values.benefits
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
      isActive: values.isActive,
    };

    void run(async () => {
      try {
        if (plan) {
          await data.updatePlan(plan.id, payload);
          toast.success(`${payload.name} updated`);
        } else {
          await data.createPlan(payload);
          toast.success(`${payload.name} created`);
        }
        onSaved();
        onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save the plan");
      }
    });
  });

  const busy = submitting || isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "New membership plan"}</DialogTitle>
          <DialogDescription>
            {plan
              ? "Update pricing, duration and benefits for this plan."
              : "Set the price, duration and perks members get with this plan."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Plan name</Label>
            <Input
              id="plan-name"
              placeholder="e.g. Monthly Unlimited"
              aria-invalid={errors.name ? true : undefined}
              {...register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              placeholder="Short line shown under the plan name"
              {...register("description")}
            />
            <FieldError message={errors.description?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Price (₹)</Label>
              <Input
                id="plan-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                placeholder="1500"
                aria-invalid={errors.price ? true : undefined}
                {...register("price", { setValueAs: (value: unknown) => numericValue(value) })}
              />
              <FieldError message={errors.price?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-duration">Duration</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="plan-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  className="w-24"
                  aria-invalid={errors.durationValue ? true : undefined}
                  {...register("durationValue", { setValueAs: (value: unknown) => numericValue(value, 1) })}
                />
                <Controller
                  control={control}
                  name="durationUnit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full" aria-invalid={errors.durationUnit ? true : undefined}>
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {DURATION_UNITS.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Runs for {durationLabel(Math.max(1, durationValue), durationUnit)}
              </p>
              <FieldError message={errors.durationValue?.message ?? errors.durationUnit?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-benefits">Benefits</Label>
            <Textarea
              id="plan-benefits"
              rows={5}
              placeholder={"One benefit per line, e.g.\nUnlimited gym floor access\n1 personal training session"}
              {...register("benefits")}
            />
            <p className="text-xs text-muted-foreground">One benefit per line — they are listed on the plan card.</p>
            <FieldError message={errors.benefits?.message} />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-secondary/40 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="plan-active">{isActive ? "Active plan" : "Archived plan"}</Label>
              <p className="text-xs text-muted-foreground">
                {isActive
                  ? "Available when assigning or renewing memberships."
                  : "Hidden from new memberships — existing members keep their access."}
              </p>
            </div>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Switch id="plan-active" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : plan ? "Save changes" : "Create plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

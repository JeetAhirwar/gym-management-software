import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSubmitGuard } from "@/hooks";
import { toDateOnly } from "@/lib/datetime";
import { durationLabel, PAYMENT_METHOD_LABELS } from "@/lib/format";
import { memberFormSchema, type MemberFormValues } from "@/lib/validation";
import type { MemberCreateInput, MemberUpdateInput } from "@/data/types";
import type { Gender, MembershipPlan, MemberWithMembership, PaymentMethod } from "@/types";

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "upi", "card", "bank_transfer", "other"];

export type MemberSavePayload =
  | { mode: "create"; input: MemberCreateInput }
  | { mode: "update"; input: MemberUpdateInput };

function emptyValues(): MemberFormValues {
  const today = toDateOnly(new Date());
  return {
    fullName: "",
    email: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    joinDate: today,
    planId: "",
    membershipStart: today,
    photoUrl: "",
    notes: "",
  };
}

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Concrete identity fields — required by create, all optional on update. */
function toIdentityInput(values: MemberFormValues) {
  return {
    fullName: values.fullName,
    email: trimOrNull(values.email),
    phone: values.phone,
    photoUrl: trimOrNull(values.photoUrl),
    dateOfBirth: values.dateOfBirth ? values.dateOfBirth : null,
    gender: values.gender ?? null,
    address: trimOrNull(values.address),
    emergencyContactName: trimOrNull(values.emergencyContactName),
    emergencyContactPhone: values.emergencyContactPhone ? values.emergencyContactPhone : null,
    joinDate: values.joinDate,
    notes: trimOrNull(values.notes),
  };
}

function toUpdateInput(values: MemberFormValues): MemberUpdateInput {
  return toIdentityInput(values);
}

function toCreateInput(
  values: MemberFormValues,
  method: PaymentMethod,
  recordPayment: boolean,
): MemberCreateInput {
  const amount = values.initialPayment;
  return {
    ...toIdentityInput(values),
    planId: values.planId,
    membershipStart: values.membershipStart,
    initialPayment:
      recordPayment && typeof amount === "number" && amount > 0
        ? { amount, method, paymentDate: toDateOnly(new Date()) }
        : null,
  };
}

/**
 * Add / edit member dialog.
 *
 * CREATE mode additionally assigns the first membership (plan + start date)
 * and can record the opening payment. EDIT mode only touches the member's
 * personal fields — memberships are managed via renew on the detail page.
 */
export function MemberFormDialog({
  open,
  onOpenChange,
  member,
  plans,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → create mode. */
  member: MemberWithMembership | null;
  plans: MembershipPlan[];
  /** Resolves to `true` when the record was saved (parent toasts + reloads). */
  onSave: (payload: MemberSavePayload) => Promise<boolean>;
}) {
  const [submitting, run] = useSubmitGuard();
  const [recordPayment, setRecordPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: emptyValues(),
  });

  const isEdit = member !== null;

  /** Plans offered in the picker — active first; fall back to everything. */
  const planChoices = useMemo(() => {
    const active = plans.filter((plan) => plan.isActive);
    return active.length > 0 ? active : plans;
  }, [plans]);

  useEffect(() => {
    if (!open) return;
    setRecordPayment(false);
    setPaymentMethod("cash");
    if (!member) {
      reset(emptyValues());
      return;
    }
    reset({
      ...emptyValues(),
      fullName: member.fullName,
      email: member.email ?? "",
      phone: member.phone,
      dateOfBirth: member.dateOfBirth ? toDateOnly(member.dateOfBirth) : "",
      gender: member.gender ?? undefined,
      address: member.address ?? "",
      emergencyContactName: member.emergencyContactName ?? "",
      emergencyContactPhone: member.emergencyContactPhone ?? "",
      joinDate: toDateOnly(member.joinDate),
      photoUrl: member.photoUrl ?? "",
      notes: member.notes ?? "",
      // Hidden in edit mode, but the schema still requires non-empty values.
      // They are never sent to `updateMember`, so a placeholder is safe.
      planId: member.membership?.planId ?? planChoices[0]?.id ?? member.id,
      membershipStart: member.membership?.startDate ?? toDateOnly(member.joinDate),
    });
  }, [open, member, planChoices, reset]);

  const submit = handleSubmit((values) => {
    void run(async () => {
      try {
        const saved = await onSave(
          member
            ? { mode: "update", input: toUpdateInput(values) }
            : { mode: "create", input: toCreateInput(values, paymentMethod, recordPayment) },
        );
        if (saved) onOpenChange(false);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save this member.");
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit member" : "Add member"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update personal details, contact information and emergency contact."
              : "Create a member profile and assign their first membership."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="member-name">Full name</Label>
              <Input id="member-name" placeholder="Aarav Sharma" {...register("fullName")} />
              {errors.fullName ? <p className="text-xs text-destructive">{errors.fullName.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-email">Email</Label>
              <Input id="member-email" type="email" placeholder="member@gym.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-phone">Phone</Label>
              <Input id="member-phone" placeholder="+91 98765 43210" {...register("phone")} />
              {errors.phone ? <p className="text-xs text-destructive">{errors.phone.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-dob">Date of birth</Label>
              <Input id="member-dob" type="date" {...register("dateOfBirth")} />
              {errors.dateOfBirth ? (
                <p className="text-xs text-destructive">{errors.dateOfBirth.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label>Gender</Label>
              <Controller
                control={control}
                name="gender"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "prefer_not_to_say"}
                    onValueChange={(value) => field.onChange(value as Gender)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.gender ? <p className="text-xs text-destructive">{errors.gender.message}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-join">Join date</Label>
              <Input id="member-join" type="date" {...register("joinDate")} />
              {errors.joinDate ? (
                <p className="text-xs text-destructive">{errors.joinDate.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-photo">Photo URL</Label>
              <Input id="member-photo" placeholder="https://…" {...register("photoUrl")} />
              {errors.photoUrl ? (
                <p className="text-xs text-destructive">{errors.photoUrl.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-emergency-name">Emergency contact name</Label>
              <Input id="member-emergency-name" placeholder="Meera Sharma" {...register("emergencyContactName")} />
              {errors.emergencyContactName ? (
                <p className="text-xs text-destructive">{errors.emergencyContactName.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="member-emergency-phone">Emergency contact phone</Label>
              <Input id="member-emergency-phone" placeholder="+91 98765 43210" {...register("emergencyContactPhone")} />
              {errors.emergencyContactPhone ? (
                <p className="text-xs text-destructive">{errors.emergencyContactPhone.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="member-address">Address</Label>
              <Input id="member-address" placeholder="Flat 4B, Palm Grove, Indiranagar" {...register("address")} />
              {errors.address ? <p className="text-xs text-destructive">{errors.address.message}</p> : null}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="member-notes">Notes</Label>
              <Textarea
                id="member-notes"
                rows={2}
                placeholder="Injuries, goals, preferred slot…"
                {...register("notes")}
              />
              {errors.notes ? <p className="text-xs text-destructive">{errors.notes.message}</p> : null}
            </div>
          </div>

          {!isEdit ? (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <p className="text-sm font-medium sm:col-span-2">First membership</p>

                <div className="space-y-2 sm:col-span-2">
                  <Label>Plan</Label>
                  <Controller
                    control={control}
                    name="planId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choose a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          {planChoices.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} · {durationLabel(plan.durationValue, plan.durationUnit)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.planId ? <p className="text-xs text-destructive">{errors.planId.message}</p> : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="member-start">Membership starts</Label>
                  <Input id="member-start" type="date" {...register("membershipStart")} />
                  {errors.membershipStart ? (
                    <p className="text-xs text-destructive">{errors.membershipStart.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="member-payment-amount">Initial payment (₹)</Label>
                  <Input
                    id="member-payment-amount"
                    inputMode="decimal"
                    placeholder="0"
                    disabled={!recordPayment}
                    {...register("initialPayment", {
                      setValueAs: (value: unknown) => {
                        if (value === "" || value === null || value === undefined) return undefined;
                        const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
                        return Number.isFinite(parsed) ? parsed : Number.NaN;
                      },
                    })}
                  />
                  {errors.initialPayment ? (
                    <p className="text-xs text-destructive">{errors.initialPayment.message}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                  <label htmlFor="member-record-payment" className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      id="member-record-payment"
                      checked={recordPayment}
                      onCheckedChange={(checked) => setRecordPayment(checked === true)}
                    />
                    Record a payment with this membership
                  </label>

                  {recordPayment ? (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="member-payment-method" className="text-xs text-muted-foreground">
                        Method
                      </Label>
                      <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}>
                        <SelectTrigger id="member-payment-method" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((method) => (
                            <SelectItem key={method} value={method}>
                              {PAYMENT_METHOD_LABELS[method]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Add member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

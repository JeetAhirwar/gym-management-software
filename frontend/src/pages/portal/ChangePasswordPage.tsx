import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRoundIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { useData } from "@/auth/AuthProvider";
import { ApiError } from "@/data/api/client";

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type PasswordChangeValues = z.infer<typeof passwordChangeSchema>;

export function ChangePasswordPage() {
  const data = useData();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordChangeValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await data.changeMyPassword(values.currentPassword, values.newPassword);
      toast.success("Password updated");
      reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setServerError("Current password is incorrect.");
      } else {
        setServerError(error instanceof Error ? error.message : "Unable to change your password.");
      }
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Change password"
        description="Use at least 8 characters you haven't used here before."
      />

      <Card className="graphite-surface max-w-lg border-border/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Your password</CardTitle>
            <p className="text-xs text-muted-foreground">Confirm your current password to continue</p>
          </div>
          <KeyRoundIcon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {serverError ? (
              <Alert variant="destructive" className="border-destructive/40">
                <KeyRoundIcon className="size-4" />
                <AlertTitle>Unable to change password</AlertTitle>
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register("currentPassword")}
              />
              {errors.currentPassword ? (
                <p className="text-xs text-destructive">{errors.currentPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                {...register("newPassword")}
              />
              {errors.newPassword ? (
                <p className="text-xs text-destructive">{errors.newPassword.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat the new password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword ? (
                <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

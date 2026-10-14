import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ShieldAlertIcon, SaveIcon, HistoryIcon, Building2Icon } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton, Stagger, TableSkeleton, } from "@/components/shared/States";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { appVersion, gymTimezone } from "@/config/env";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync, useSubmitGuard } from "@/hooks";
import { formatDateTime, titleCase } from "@/lib/format";
import { can } from "@/lib/permissions";
import { settingsFormSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
const COMMON_TIMEZONES = [
    "Asia/Kolkata",
    "Asia/Dubai",
    "Asia/Singapore",
    "Asia/Tokyo",
    "Europe/London",
    "Europe/Berlin",
    "America/New_York",
    "America/Los_Angeles",
    "Australia/Sydney",
];
const DEFAULT_VALUES = {
    gymName: "",
    timezone: gymTimezone,
    checkinCooldownMinutes: 5,
    trackCheckout: true,
    expiringSoonDays: 7,
    expiryReminderDays: "7, 3, 1",
    allowExpiredCheckin: false,
    enableEmail: false,
    enableSms: false,
    enableWhatsapp: false,
    enablePush: true,
};
/** "7, 3, 1" → [1, 3, 7]; drops anything that is not a whole day count. */
function parseReminderDays(raw) {
    const days = new Set();
    for (const part of raw.split(",")) {
        const text = part.trim();
        if (text === "")
            continue;
        const value = Number(text);
        if (Number.isInteger(value) && value >= 0 && value <= 365)
            days.add(value);
    }
    return [...days].sort((a, b) => a - b);
}
function SwitchRow({ id, label, description, checked, onCheckedChange, disabled, }) {
    return (<div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
        {description ? (<p className="text-xs text-muted-foreground">{description}</p>) : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}/>
    </div>);
}
export function SettingsPage() {
    const data = useData();
    const { session } = useAuth();
    const canManage = can(session?.profile.role, "settings.manage");
    const settings = useAsync(() => data.getSettings(), [data]);
    const gym = useAsync(() => data.getGym(), [data]);
    const audit = useAsync(() => data.listAuditLogs(50), [data]);
    const [saving, runSave] = useSubmitGuard();
    const { register, handleSubmit, control, reset, watch, formState: { errors }, } = useForm({
        resolver: zodResolver(settingsFormSchema),
        defaultValues: DEFAULT_VALUES,
    });
    useEffect(() => {
        if (!settings.data || !gym.data)
            return;
        reset({
            gymName: gym.data.name,
            timezone: gym.data.timezone,
            checkinCooldownMinutes: settings.data.checkinCooldownMinutes,
            trackCheckout: settings.data.trackCheckout,
            expiringSoonDays: settings.data.expiringSoonDays,
            expiryReminderDays: settings.data.expiryReminderDays.join(", "),
            allowExpiredCheckin: settings.data.allowExpiredCheckin,
            enableEmail: settings.data.enableEmail,
            enableSms: settings.data.enableSms,
            enableWhatsapp: settings.data.enableWhatsapp,
            enablePush: settings.data.enablePush,
        });
    }, [settings.data, gym.data, reset]);
    const currentTimezone = watch("timezone");
    const timezoneOptions = currentTimezone && !COMMON_TIMEZONES.includes(currentTimezone)
        ? [currentTimezone, ...COMMON_TIMEZONES]
        : COMMON_TIMEZONES;
    const onSubmit = handleSubmit((values) => {
        const expiryReminderDays = parseReminderDays(values.expiryReminderDays);
        if (expiryReminderDays.length === 0) {
            toast.error("Enter at least one expiry reminder day, e.g. 7, 3, 1");
            return;
        }
        void runSave(async () => {
            try {
                await data.updateSettings({
                    gymName: values.gymName.trim(),
                    timezone: values.timezone,
                    checkinCooldownMinutes: values.checkinCooldownMinutes,
                    trackCheckout: values.trackCheckout,
                    expiringSoonDays: values.expiringSoonDays,
                    expiryReminderDays,
                    allowExpiredCheckin: values.allowExpiredCheckin,
                    enableEmail: values.enableEmail,
                    enableSms: values.enableSms,
                    enableWhatsapp: values.enableWhatsapp,
                    enablePush: values.enablePush,
                });
                toast.success("Settings saved");
                settings.reload();
                gym.reload();
                audit.reload();
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to save settings.");
            }
        });
    });
    if (settings.loading || gym.loading) {
        return (<div className="space-y-6">
        <PageHeader title="Settings" description="Gym profile, check-in policy and reminders."/>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2"/>
          <Skeleton className="h-96"/>
        </div>
        <Skeleton className="h-64"/>
      </div>);
    }
    if (settings.error) {
        return (<div className="space-y-6">
        <PageHeader title="Settings" description="Gym profile, check-in policy and reminders."/>
        <ErrorState title="Unable to load settings" message={settings.error} onRetry={settings.reload}/>
      </div>);
    }
    return (<div className="space-y-6">
      <PageHeader title="Settings" description="Gym profile, check-in policy, reminders and notification channels."/>

      {!canManage ? (<Alert>
          <ShieldAlertIcon className="size-4"/>
          <AlertTitle>Read-only access</AlertTitle>
          <AlertDescription>
            Your role can review these settings but not change them. Ask an admin or the owner to
            make edits.
          </AlertDescription>
        </Alert>) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Card 1 — settings form */}
        <Stagger className="h-full lg:col-span-2">
          <Card className="graphite-surface border-border/70">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base">Gym profile &amp; check-in policy</CardTitle>
              <p className="text-xs text-muted-foreground">
                Applied to QR check-ins, expiry maths and every reminder the app sends.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} noValidate className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gym-name">Gym name</Label>
                    <Input id="gym-name" disabled={!canManage} placeholder="Pulse Fitness Studio" {...register("gymName")}/>
                    {errors.gymName ? (<p className="text-xs text-destructive">{errors.gymName.message}</p>) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Timezone</Label>
                    <Controller control={control} name="timezone" render={({ field }) => (<Select value={field.value} onValueChange={field.onChange} disabled={!canManage}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Choose a timezone"/>
                          </SelectTrigger>
                          <SelectContent>
                            {timezoneOptions.map((zone) => (<SelectItem key={zone} value={zone}>
                                {zone}
                              </SelectItem>))}
                          </SelectContent>
                        </Select>)}/>
                    {errors.timezone ? (<p className="text-xs text-destructive">{errors.timezone.message}</p>) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cooldown">Check-in cooldown (minutes)</Label>
                    <Input id="cooldown" type="number" min={0} max={1440} disabled={!canManage} {...register("checkinCooldownMinutes", { valueAsNumber: true })}/>
                    <p className="text-xs text-muted-foreground">
                      Minimum gap between two accepted check-ins for the same member.
                    </p>
                    {errors.checkinCooldownMinutes ? (<p className="text-xs text-destructive">
                        {errors.checkinCooldownMinutes.message}
                      </p>) : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expiring-soon">“Expiring soon” window (days)</Label>
                    <Input id="expiring-soon" type="number" min={1} max={90} disabled={!canManage} {...register("expiringSoonDays", { valueAsNumber: true })}/>
                    {errors.expiringSoonDays ? (<p className="text-xs text-destructive">{errors.expiringSoonDays.message}</p>) : null}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="reminder-days">Expiry reminder days</Label>
                    <Textarea id="reminder-days" rows={2} disabled={!canManage} placeholder="7, 3, 1" {...register("expiryReminderDays")}/>
                    <p className="text-xs text-muted-foreground">
                      Comma-separated days-before-expiry that trigger a reminder.
                    </p>
                    {errors.expiryReminderDays ? (<p className="text-xs text-destructive">{errors.expiryReminderDays.message}</p>) : null}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Check-in behaviour
                  </p>
                  <Controller control={control} name="trackCheckout" render={({ field }) => (<SwitchRow id="track-checkout" label="Track check-outs" description="Ask members to scan out so you can measure dwell time." checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                  <Controller control={control} name="allowExpiredCheckin" render={({ field }) => (<SwitchRow id="allow-expired" label="Allow expired check-ins" description="Let expired members scan in (front desk will see a warning)." checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                </div>

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Notification channels
                  </p>
                  <Controller control={control} name="enableEmail" render={({ field }) => (<SwitchRow id="enable-email" label="Email" checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                  <Controller control={control} name="enableSms" render={({ field }) => (<SwitchRow id="enable-sms" label="SMS" checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                  <Controller control={control} name="enableWhatsapp" render={({ field }) => (<SwitchRow id="enable-whatsapp" label="WhatsApp" checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                  <Controller control={control} name="enablePush" render={({ field }) => (<SwitchRow id="enable-push" label="Push notifications" description="In-app alerts on the dashboard and notifications screen." checked={field.value} onCheckedChange={field.onChange} disabled={!canManage}/>)}/>
                </div>

                <div className="flex justify-end border-t border-border/60 pt-4">
                  <Button type="submit" disabled={!canManage || saving}>
                    {saving ? null : <SaveIcon className="size-4"/>}
                    {saving ? "Saving…" : "Save settings"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </Stagger>

        {/* Card 2 — gym details */}
        <Stagger className="h-full" delayIndex={1}>
          <Card className="graphite-surface h-full border-border/70">
            <CardHeader className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2Icon className="size-4 text-muted-foreground"/>
                Gym details
              </CardTitle>
              <p className="text-xs text-muted-foreground">Read-only account information.</p>
            </CardHeader>
            <CardContent>
              {gym.error ? (<ErrorState message={gym.error} onRetry={gym.reload}/>) : gym.data ? (<dl className="space-y-3 text-sm">
                  {[
                ["Name", gym.data.name],
                ["Slug", gym.data.slug],
                ["Timezone", gym.data.timezone],
                ["Currency", gym.data.currency],
                ["Address", gym.data.address ?? "—"],
                ["Phone", gym.data.phone ?? "—"],
                ["Email", gym.data.email ?? "—"],
                ["App version", appVersion],
            ].map(([label, value]) => (<div key={label} className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
                      <dd className={cn("break-words text-right font-medium", value === "—" && "font-normal text-muted-foreground")}>
                        {value}
                      </dd>
                    </div>))}
                </dl>) : (<Skeleton className="h-56"/>)}
            </CardContent>
          </Card>
        </Stagger>
      </div>

      {/* Card 3 — audit trail */}
      <Stagger delayIndex={2}>
        <Card className="graphite-surface border-border/70">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <HistoryIcon className="size-4 text-muted-foreground"/>
                Audit trail
              </CardTitle>
              <p className="text-xs text-muted-foreground">Last 50 changes recorded by the app.</p>
            </div>
          </CardHeader>
          <CardContent>
            {audit.loading ? (<TableSkeleton rows={6} cols={4}/>) : audit.error ? (<ErrorState title="Unable to load the audit trail" message={audit.error} onRetry={audit.reload}/>) : (audit.data ?? []).length === 0 ? (<EmptyState title="No activity yet" description="Changes to members, payments and settings will appear here." className="py-10"/>) : (<div className="overflow-x-auto rounded-lg border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(audit.data ?? []).map((log) => (<TableRow key={log.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell className="text-sm">{log.actorName ?? "System"}</TableCell>
                        <TableCell className="text-sm">{titleCase(log.action)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {titleCase(log.entity)}
                        </TableCell>
                      </TableRow>))}
                  </TableBody>
                </Table>
              </div>)}
          </CardContent>
        </Card>
      </Stagger>
    </div>);
}

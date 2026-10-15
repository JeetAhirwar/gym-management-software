import { useEffect, useState } from "react";
import { Building2Icon, ClockIcon, Loader2Icon, PlusIcon, PrinterIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, Skeleton } from "@/components/shared/States";
import { useAuth, useData } from "@/auth/AuthProvider";
import { useAsync, useSubmitGuard } from "@/hooks";
import { can } from "@/lib/permissions";
import { renderQrDataUrl } from "@/lib/qr";

/** `13:05` → `01:05 PM`. */
function format12h(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${suffix}`;
}
/** Ready-made 4-hour slots from 06:00 to 21:59. */
function defaultSlots() {
    const out = [];
    for (let startH = 6; startH + 4 <= 22; startH += 4) {
        out.push({
            start: `${String(startH).padStart(2, "0")}:00`,
            end: `${String(startH + 3).padStart(2, "0")}:59`,
        });
    }
    return out;
}
/**
 * Manage Gym — the front-desk setup: the single gym QR members scan from
 * their portal, and the daily slot schedule.
 */
export function ManageGymPage() {
    const data = useData();
    const { session } = useAuth();
    const canManage = can(session?.profile.role, "settings.manage");
    const gym = useAsync(() => (canManage ? data.getGymFresh() : Promise.resolve(null)), [data, canManage]);
    const qr = useAsync(() => (canManage ? data.getGymQr() : Promise.resolve(null)), [data, canManage]);
    const [slots, setSlots] = useState(null);
    const [saving, run] = useSubmitGuard();
    const [qrDataUrl, setQrDataUrl] = useState(null);
    const [rotateArmed, setRotateArmed] = useState(false);
    const [rotating, setRotating] = useState(false);

    useEffect(() => {
        if (gym.data)
            setSlots(gym.data.timeSlots ?? []);
    }, [gym.data]);
    useEffect(() => {
        let cancelled = false;
        setQrDataUrl(null);
        const token = qr.data?.token;
        if (!token)
            return;
        renderQrDataUrl(token, { width: 480 })
            .then((url) => {
            if (!cancelled)
                setQrDataUrl(url);
        })
            .catch(() => {
            if (!cancelled)
                setQrDataUrl(null);
        });
        return () => {
            cancelled = true;
        };
    }, [qr.data?.token]);

    if (!canManage) {
        return (<div className="py-16">
          <EmptyState title="Gym admins only" description="Slot schedules and the gym QR are managed by the gym owner or an admin."/>
        </div>);
    }

    const updateSlot = (index, patch) => {
        setSlots((prev) => (prev ?? []).map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
    };
    const addSlot = () => setSlots((prev) => [...(prev ?? []), { start: "", end: "" }]);
    const removeSlot = (index) => setSlots((prev) => (prev ?? []).filter((_, i) => i !== index));
    const handleSave = () => {
        void run(async () => {
            try {
                const cleaned = (slots ?? [])
                    .filter((slot) => slot.start && slot.end)
                    .sort((a, b) => (a.start < b.start ? -1 : 1));
                const incomplete = (slots ?? []).some((slot) => !slot.start || !slot.end);
                if (incomplete) {
                    toast.error("Give every slot a start and end time (or remove the empty row).");
                    return;
                }
                await data.updateTimeSlots(cleaned);
                setSlots(cleaned);
                toast.success("Slot schedule saved");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to save the slots.");
            }
        });
    };
    const handleRotate = () => {
        if (rotating)
            return;
        if (!rotateArmed) {
            setRotateArmed(true);
            toast.info("Click rotate again to confirm — every previously printed QR will stop working.");
            return;
        }
        setRotating(true);
        void (async () => {
            try {
                await data.rotateGymQr();
                setRotateArmed(false);
                qr.reload();
                toast.success("Gym QR regenerated — print the new code and take down the old one.");
            }
            catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to rotate the QR.");
            }
            finally {
                setRotating(false);
            }
        })();
    };
    const handlePrint = () => {
        if (!qrDataUrl)
            return;
        const w = window.open("", "_blank");
        if (!w) {
            toast.error("Allow pop-ups to print the QR code.");
            return;
        }
        w.document.write(`<html><head><title>Gym QR — front desk</title></head><body style="display:flex;flex-direction:column;align-items:center;gap:12px;font-family:sans-serif;padding:24px"><h2 style="margin:0">${session?.gym?.name ?? "Gym"} — front desk</h2><img src="${qrDataUrl}" style="width:70vmin;max-width:520px"/><p style="margin:0">Members scan this QR from their member portal to check in and out.</p></body></html>`);
        w.document.close();
        w.focus();
        w.print();
    };

    const tokenHint = qr.data?.token ? `${qr.data.token.slice(0, 4).toUpperCase()}…${qr.data.token.slice(-4).toUpperCase()}` : null;

    return (<div className="space-y-6">
      <PageHeader title="Manage Gym" description="The front-desk gym QR and the daily slot schedule — set once, used every day."/>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        {/* ---------------- Gym QR ---------------- */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2Icon className="size-4 text-primary"/> Front-desk gym QR
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              One QR for the whole gym — print it and stick it at the front desk. Members scan it from their portal:
              first scan starts the timer, the next scan checks them out.
            </p>
            {qr.loading && !qr.data ? (<Skeleton className="mx-auto size-56 rounded-lg"/>) : qr.error && !qr.data ? (<ErrorState title="Unable to load the gym QR" message={qr.error} onRetry={qr.reload}/>) : qrDataUrl ? (<div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-white p-4">
                <img src={qrDataUrl} alt="Gym front-desk QR code" className="size-52 rounded-md"/>
                {tokenHint ? (<p className="font-mono text-[10px] tracking-wider text-muted-foreground">Token {tokenHint}</p>) : null}
              </div>) : (<Skeleton className="mx-auto size-56 rounded-lg"/>)}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!qrDataUrl} onClick={handlePrint}>
                <PrinterIcon className="size-4"/> Print
              </Button>
              <Button variant="outline" size="sm" className={rotateArmed ? "border-destructive text-destructive" : ""} disabled={rotating || !qr.data?.token} onClick={handleRotate}>
                {rotating ? <Loader2Icon className="size-4 animate-spin"/> : <RefreshCwIcon className="size-4"/>}
                {rotateArmed ? "Confirm rotate" : "Rotate QR"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------- Slots ---------------- */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClockIcon className="size-4 text-primary"/> Daily time slots
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The gym's operating slots (e.g. morning / afternoon / evening batches). These drive scheduling and reporting.
            </p>

            {gym.loading && slots === null ? (<Skeleton className="h-40 rounded-lg"/>) : gym.error && slots === null ? (<ErrorState title="Unable to load the slots" message={gym.error} onRetry={gym.reload}/>) : (<ul className="space-y-2">
              {(slots ?? []).map((slot, index) => (<li key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
                  <span className="w-6 font-mono text-xs text-muted-foreground">{index + 1}.</span>
                  <Input type="time" aria-label={`Slot ${index + 1} start`} value={slot.start} onChange={(e) => updateSlot(index, { start: e.target.value })} className="h-8 w-28 font-mono text-xs"/>
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="time" aria-label={`Slot ${index + 1} end`} value={slot.end} onChange={(e) => updateSlot(index, { end: e.target.value })} className="h-8 w-28 font-mono text-xs"/>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {slot.start && slot.end ? `${format12h(slot.start)} – ${format12h(slot.end)}` : "—"}
                  </span>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Remove slot ${index + 1}`} onClick={() => removeSlot(index)}>
                    <Trash2Icon className="size-4"/>
                  </Button>
                </li>))}
              {(slots ?? []).length === 0 ? (<li className="rounded-lg border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
                  No slots yet — add one below, or drop in the ready-made 4-hour schedule.
                </li>) : null}
            </ul>)}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addSlot}>
                <PlusIcon className="size-4"/> Add slot
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSlots(defaultSlots())}>
                Fill 4-hour slots
              </Button>
              <Button size="sm" className="ml-auto" disabled={saving} onClick={handleSave}>
                {saving ? <Loader2Icon className="size-4 animate-spin"/> : null} Save slots
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>);
}

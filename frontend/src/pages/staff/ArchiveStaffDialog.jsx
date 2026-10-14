import { ArchiveIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, } from "@/components/ui/dialog";
import { useSubmitGuard } from "@/hooks";
/**
 * Confirmation dialog used before archiving a staff member.
 * `staff === null` keeps the dialog closed.
 */
export function ArchiveStaffDialog({ staff, onOpenChange, onConfirm, }) {
    const [submitting, run] = useSubmitGuard();
    return (<Dialog open={staff !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArchiveIcon className="size-4 text-destructive"/>
            Archive {staff?.fullName ?? "staff member"}?
          </DialogTitle>
          <DialogDescription>
            They will be marked as resigned and hidden from day-to-day screens. Existing records and
            class history stay intact, and you can bring them back at any time by editing their status.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep active
          </Button>
          <Button variant="destructive" disabled={submitting} onClick={() => {
            void run(async () => {
                if (await onConfirm())
                    onOpenChange(false);
            });
        }}>
            {submitting ? <Loader2Icon className="size-4 animate-spin"/> : <ArchiveIcon className="size-4"/>}
            {submitting ? "Archiving…" : "Archive staff member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>);
}

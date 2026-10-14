import { AnimatePresence, motion } from "motion/react";
import { CheckIcon, XIcon } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/shared/States";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface FeedEntry {
  key: string;
  /** ISO timestamp of the event. */
  at: string;
  ok: boolean;
  title: string;
  subtitle?: string;
}

export function ScanFeed({
  entries,
  loading,
  className,
}: {
  entries: FeedEntry[];
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("max-h-[26rem] overflow-y-auto pr-1", className)}>
      {loading && entries.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-12" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="No scans yet"
          description="The last check-ins from this console show up here."
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-border/60">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li
                key={entry.key}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    entry.ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive",
                  )}
                >
                  {entry.ok ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{entry.title}</p>
                  {entry.subtitle ? (
                    <p className="truncate text-xs text-muted-foreground">{entry.subtitle}</p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatTime(entry.at)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

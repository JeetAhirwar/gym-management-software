import { useState } from "react";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/format";
/** Remote image with graceful local fallback (initials) when it fails to load. */
export function SmartImage({ src, name, className, alt, }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return (<span aria-label={name} className={cn("flex items-center justify-center rounded-full bg-secondary font-medium text-muted-foreground select-none", className)}>
        {initialsOf(name)}
      </span>);
    }
    return (<img src={src} alt={alt ?? name} loading="lazy" onError={() => setFailed(true)} className={cn("rounded-full object-cover", className)}/>);
}

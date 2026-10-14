import { useEffect, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { QrCodeIcon, RotateCcwIcon } from "lucide-react";
import { SmartImage } from "@/components/shared/SmartImage";
import { Skeleton } from "@/components/shared/States";
import { formatDate, formatINR } from "@/lib/format";
import { tokenHint } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { membershipProgress } from "./paper";
import { Stamp } from "./PaperBits";
import gymImg from "../../../gym-img.jpg";

const STAMP_TONES = {
    active: { tone: "ok", label: "Active" },
    expiring_soon: { tone: "warn", label: "Expiring" },
    expired: { tone: "bad", label: "Expired" },
    suspended: { tone: "bad", label: "Suspended" },
    inactive: { tone: "muted", label: "Inactive" },
    none: { tone: "muted", label: "No plan" },
};

/**
 * The hero: a paper "membership pass" in real 3D.
 *  - tilt follows the pointer (fine pointers only, disabled for reduced motion)
 *  - "Show QR" flips the card 180° to reveal the check-in QR on the back
 */
export function MembershipPass({ profile, qr, qrDataUrl }) {
    const reduced = useReducedMotion();
    const [flipped, setFlipped] = useState(false);
    const [canTilt] = useState(() => typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches);
    const tiltEnabled = canTilt && !reduced;

    const rotateXInput = useMotionValue(0);
    const rotateYInput = useMotionValue(0);
    const spring = { stiffness: 170, damping: 18, mass: 0.6 };
    const rotateX = useSpring(useTransform(rotateXInput, [-0.5, 0.5], [8, -8]), spring);
    const rotateY = useSpring(useTransform(rotateYInput, [-0.5, 0.5], [-11, 11]), spring);

    const handleMove = (event) => {
        if (!tiltEnabled)
            return;
        const rect = event.currentTarget.getBoundingClientRect();
        rotateYInput.set((event.clientX - rect.left) / rect.width - 0.5);
        rotateXInput.set((event.clientY - rect.top) / rect.height - 0.5);
    };
    const handleLeave = () => {
        rotateYInput.set(0);
        rotateXInput.set(0);
    };

    const me = profile ?? null;
    const membership = me?.membership ?? null;
    const days = me?.daysRemaining ?? null;
    const stamp = STAMP_TONES[me?.effectiveStatus] ?? STAMP_TONES.none;
    const progress = membershipProgress(membership);
    const qrRevoked = qr?.data?.status === "revoked";

    // Preload the QR quietly so the flip lands on a ready image.
    useEffect(() => {
        if (!qrDataUrl)
            return;
        const img = new Image();
        img.src = qrDataUrl;
    }, [qrDataUrl]);

    return (<div className="pp-scene mx-auto max-w-2xl">
      <motion.div className="relative aspect-[1.62/1] min-h-[330px] w-full" style={{ rotateX: tiltEnabled ? rotateX : 0, rotateY: tiltEnabled ? rotateY : 0, transformStyle: "preserve-3d" }} onMouseMove={handleMove} onMouseLeave={handleLeave}>
        <motion.div className="pp-flip absolute inset-0" animate={{ rotateY: flipped ? 180 : 0 }} transition={reduced ? { duration: 0.001 } : { type: "spring", stiffness: 90, damping: 15 }}>

          {/* ---------------- FRONT ---------------- */}
          <div className="pp-face paper-surface paper-lift absolute inset-0 overflow-hidden rounded-2xl">
            {/* printed gym photo, faded into the paper */}
            <img src={gymImg} alt="" aria-hidden="true" loading="eager" className="pointer-events-none absolute inset-0 size-full object-cover opacity-[0.16] grayscale" onError={(event) => {
            event.currentTarget.style.display = "none";
        }}/>
            <span aria-hidden="true" className="paper-tape"/>

            <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.3em] text-paper-foreground/60 uppercase">
                    Pulse Gym Suite
                  </p>
                  <p className="font-serif text-lg leading-tight">Membership pass</p>
                </div>
                <Stamp label={stamp.label} tone={stamp.tone} className="mt-1 mr-2"/>
              </div>

              <div className="flex items-center gap-4">
                <SmartImage src={me?.photoUrl} name={me?.fullName ?? "Member"} className="size-14 shrink-0 rounded-full text-xs ring-2 ring-paper-edge sm:size-16"/>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold tracking-tight sm:text-2xl">
                    {me?.fullName ?? "Member"}
                  </p>
                  <p className="truncate font-mono text-[11px] tracking-wide text-paper-foreground/70">
                    {me?.memberCode ?? "—"}
                    {membership?.planName ? ` · ${membership.planName}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-serif text-3xl leading-none sm:text-4xl">
                    <span className="pp-mark">{days === null ? "—" : days <= 0 ? "0" : days}</span>
                  </p>
                  <p className="mt-1.5 text-[10px] tracking-[0.2em] text-paper-foreground/60 uppercase">
                    {days === null ? "validity unavailable" : days <= 0 ? "expired — renew at desk" : days === 1 ? "day remaining" : "days remaining"}
                  </p>
                  {progress !== null ? (<div aria-label={`${Math.round(progress * 100)}% of membership elapsed`} className="mt-2 h-1.5 w-32 overflow-hidden rounded-full bg-paper-2 sm:w-40">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }}/>
                    </div>) : null}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <p className="font-mono text-[10px] tracking-wide text-paper-foreground/60">
                    {formatDate(membership?.startDate)} — {formatDate(membership?.endDate)}
                  </p>
                  {membership?.balance != null ? (<p className={cn("font-mono text-[10px] font-semibold tracking-wide", membership.balance > 0 ? "text-[#a3601f]" : "text-[#3f7d51]")}>
                      {membership.balance > 0 ? `Due ${formatINR(membership.balance)}` : "Paid in full"}
                    </p>) : null}
                  <button type="button" onClick={() => setFlipped(true)} aria-pressed={flipped} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-offset-2">
                    <QrCodeIcon className="size-3.5"/> Show QR
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- BACK ---------------- */}
          <div className={cn("pp-face pp-face-back paper-surface paper-lift absolute inset-0 overflow-hidden rounded-2xl")}>
            <div className="relative z-10 flex h-full flex-col items-center justify-center gap-2 p-5 text-center sm:p-6">
              <p className="font-mono text-[10px] tracking-[0.3em] text-paper-foreground/60 uppercase">
                Check-in · {me?.memberCode ?? "—"}
              </p>

              {qr?.error ? (<div className="space-y-2">
                  <p className="text-sm font-medium text-[#a33d2a]">Unable to load your QR code</p>
                  <button type="button" onClick={qr.reload} className="rounded-full border border-paper-edge px-3 py-1 text-xs font-medium text-paper-foreground/80 hover:bg-paper-2">
                    Retry
                  </button>
                </div>) : qrDataUrl ? (<img src={qrDataUrl} alt="Your membership check-in QR code" className="rounded-lg bg-white p-1.5 shadow-sm size-36 sm:size-40"/>) : (<Skeleton className="size-36 rounded-lg bg-paper-2 sm:size-40"/>)}

              <p className="text-sm font-medium">Show this at the front desk</p>
              {qr?.data?.token ? (<p className="font-mono text-[10px] tracking-wider text-paper-foreground/60">
                  Token {tokenHint(qr.data.token)}
                </p>) : null}

              {qrRevoked ? (<p className="max-w-[16rem] text-xs font-medium text-[#a33d2a]">
                  This QR was revoked — please ask the front desk for a new card.
                </p>) : null}

              <button type="button" onClick={() => setFlipped(false)} aria-pressed={flipped} className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-paper-edge bg-paper-2 px-3.5 py-1.5 text-xs font-semibold transition-transform hover:scale-[1.04]">
                <RotateCcwIcon className="size-3.5"/> Back to pass
              </button>
            </div>
          </div>

        </motion.div>
      </motion.div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        {tiltEnabled ? "Move your pointer over the pass — then flip it for the QR." : "Tap “Show QR” to flip the pass."}
      </p>
    </div>);
}

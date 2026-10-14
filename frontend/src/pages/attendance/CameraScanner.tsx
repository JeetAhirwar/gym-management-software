import { useEffect, useRef } from "react";
import { Html5Qrcode, type CameraDevice } from "html5-qrcode";

/**
 * Camera lifecycle wrapper around `html5-qrcode`.
 *
 * Every camera operation is serialised through a promise queue so rapid
 * start/stop toggles (and React StrictMode's double-invoked effects) can never
 * overlap two scanners on the same element. All failures are funnelled into a
 * friendly `ScannerStatus` — the scanner must never throw into the page.
 */

export type ScannerStatus =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "scanning"; cameraLabel: string }
  | { state: "error"; message: string };

const VIEWFINDER_ID = "pgs-attendance-viewfinder";

const SCAN_CONFIG = { fps: 10, qrbox: { width: 240, height: 240 } };

/** Error whose message is already written for the front desk — no re-mapping. */
class CameraError extends Error {
  readonly friendly = true;
  constructor(message: string) {
    super(message);
    this.name = "CameraError";
  }
}

function assertCameraAvailable(): void {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new CameraError(
      "Camera access needs a secure (HTTPS) connection and this page is not secure, so the browser blocked it. Use manual check-in below.",
    );
  }
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      "This browser cannot use a camera here (no camera API or it is blocked). Use manual check-in below.",
    );
  }
}

function friendlyCameraMessage(error: unknown): string {
  if (error instanceof CameraError) return error.message;
  const name = error instanceof Error ? error.name : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string" && error.trim().length > 0
        ? error
        : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Camera permission was denied. Allow camera access for this site in your browser, then try again — or use manual check-in below.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return "No usable camera was found on this device. Use manual check-in below.";
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return "The camera is busy in another app or tab. Close it and try again, or use manual check-in below.";
  }
  return message || "The camera could not be started. You can still check members in manually below.";
}

interface CameraTarget {
  request: string | MediaTrackConstraints;
  label: string;
}

/** Prefer a rear camera; fall back to the only camera, then to `facingMode: environment`. */
function pickCamera(cameras: CameraDevice[]): CameraTarget {
  const rear = cameras.find((camera) => /back|rear|environment/i.test(camera.label));
  if (rear) return { request: rear.id, label: rear.label || "Rear camera" };
  const first = cameras[0];
  if (cameras.length === 1 && first) return { request: first.id, label: first.label || "Camera" };
  return { request: { facingMode: "environment" }, label: first?.label || "Camera" };
}

interface CameraScannerProps {
  /** Whether the camera should be running. */
  active: boolean;
  /** Bumped to force a restart after a failure. */
  attempt: number;
  onDecoded: (rawText: string) => void;
  onStatus: (status: ScannerStatus) => void;
}

export function CameraScanner({ active, attempt, onDecoded, onStatus }: CameraScannerProps) {
  const instanceRef = useRef<Html5Qrcode | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const onDecodedRef = useRef(onDecoded);
  const onStatusRef = useRef(onStatus);
  onDecodedRef.current = onDecoded;
  onStatusRef.current = onStatus;

  useEffect(() => {
    if (!active) {
      onStatusRef.current({ state: "idle" });
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    const stopScanner = async (scanner: Html5Qrcode): Promise<void> => {
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* already stopped / never finished starting */
      }
      try {
        scanner.clear();
      } catch {
        /* clear() refuses to run while scanning — nothing left to clean */
      }
    };

    const teardown = async (): Promise<void> => {
      const scanner = instanceRef.current;
      instanceRef.current = null;
      if (scanner) await stopScanner(scanner);
    };

    const start = async (): Promise<void> => {
      try {
        assertCameraAvailable();
        const cameras = await Html5Qrcode.getCameras();
        if (isCancelled()) return;
        if (cameras.length === 0) {
          throw new CameraError("No camera was detected on this device. Use manual check-in below.");
        }
        const target = pickCamera(cameras);
        const scanner = new Html5Qrcode(VIEWFINDER_ID);
        instanceRef.current = scanner;
        await scanner.start(
          target.request,
          SCAN_CONFIG,
          (decodedText) => {
            if (!isCancelled()) onDecodedRef.current(decodedText);
          },
          () => {
            /* no code inside the frame on this frame — expected, stay quiet */
          },
        );
        if (isCancelled()) {
          instanceRef.current = null;
          await stopScanner(scanner);
          return;
        }
        onStatusRef.current({ state: "scanning", cameraLabel: target.label });
      } catch (error) {
        const scanner = instanceRef.current;
        instanceRef.current = null;
        if (scanner) await stopScanner(scanner);
        if (isCancelled()) return;
        onStatusRef.current({ state: "error", message: friendlyCameraMessage(error) });
      }
    };

    const enqueue = (op: () => Promise<void>): void => {
      queueRef.current = queueRef.current.then(op, op).catch(() => undefined);
    };

    onStatusRef.current({ state: "starting" });
    enqueue(start);

    return () => {
      cancelled = true;
      enqueue(teardown);
    };
  }, [active, attempt]);

  return (
    <div
      id={VIEWFINDER_ID}
      className="aspect-square w-full overflow-hidden rounded-xl border border-border bg-black"
    />
  );
}

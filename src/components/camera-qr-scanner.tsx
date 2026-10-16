"use client";

import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { Camera, CameraOff, Loader2, RotateCcw, TextCursorInput, VideoOff } from "lucide-react";
import { match } from "ts-pattern";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CameraState =
  | { kind: "checking" }
  | { kind: "requesting" }
  | { kind: "scanning" }
  | { kind: "denied" }
  | { kind: "no-camera" }
  | { kind: "unsupported" }
  | { kind: "error"; message: string };

/** Maps a `getUserMedia` failure to the placeholder the user should see. */
function cameraErrorState(error: unknown): CameraState {
  const name = (error as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return { kind: "denied" };
  if (name === "NotFoundError" || name === "OverconstrainedError") return { kind: "no-camera" };
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      kind: "error",
      message: "The camera is in use by another app or could not be opened.",
    };
  }
  return { kind: "error", message: "The camera could not be started." };
}

/**
 * Camera viewfinder that decodes the first QR code it sees and hands its text to `onResult`.
 * The camera is only opened while this component is mounted and is released on unmount.
 * Every state where scanning is impossible (no API, insecure context, no camera, permission
 * pending or denied, camera busy) renders a placeholder with a way back to manual input.
 */
export function CameraQrScanner({
  onResult,
  onPasteInstead,
}: {
  onResult: (text: string) => void;
  onPasteInstead: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const [state, setState] = useState<CameraState>({ kind: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let cancelled = false;
    let scanner: QrScanner | null = null;
    const update = (next: CameraState) => {
      if (!cancelled) setState(next);
    };

    async function start() {
      // getUserMedia exists only in secure contexts (HTTPS or localhost).
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        return update({ kind: "unsupported" });
      }

      const { default: QrScannerLib } = await import("qr-scanner");
      if (!(await QrScannerLib.hasCamera())) return update({ kind: "no-camera" });

      const permission = await navigator.permissions
        ?.query({ name: "camera" as PermissionName })
        .catch(() => null);
      if (permission?.state === "denied") return update({ kind: "denied" });
      update(permission?.state === "granted" ? { kind: "checking" } : { kind: "requesting" });

      // Ask for the camera ourselves first: qr-scanner turns every getUserMedia failure into a
      // generic "Camera not found", which would hide a denied permission or a busy camera.
      try {
        const probe = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        probe.getTracks().forEach((track) => track.stop());
      } catch (error) {
        return update(cameraErrorState(error));
      }

      if (cancelled || !videoRef.current) return;
      let decoded = false;
      scanner = new QrScannerLib(
        videoRef.current,
        (result) => {
          if (decoded) return;
          decoded = true;
          scanner?.stop();
          onResultRef.current(result.data);
        },
        { returnDetailedScanResult: true, preferredCamera: "environment", maxScansPerSecond: 10 }
      );
      try {
        await scanner.start();
        update({ kind: "scanning" });
      } catch {
        update({ kind: "error", message: "The camera could not be started." });
      }
    }

    void start();
    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, [attempt]);

  const retry = () => {
    setState({ kind: "checking" });
    setAttempt((n) => n + 1);
  };

  const pasteInstead = (
    <Button size="sm" variant="outline" action="muted" onClick={onPasteInstead}>
      <TextCursorInput />
      Enter address instead
    </Button>
  );
  const tryAgain = (
    <Button size="sm" onClick={retry}>
      <RotateCcw />
      Try again
    </Button>
  );

  const placeholder = match(state)
    .with({ kind: "scanning" }, () => null)
    .with({ kind: "checking" }, () => ({
      icon: <Loader2 className="animate-spin" />,
      title: "Starting camera…",
      description: null,
      actions: null,
    }))
    .with({ kind: "requesting" }, () => ({
      icon: <Camera />,
      title: "Waiting for camera permission",
      description: "Allow camera access in your browser's prompt to scan a QR code.",
      actions: pasteInstead,
    }))
    .with({ kind: "denied" }, () => ({
      icon: <CameraOff />,
      title: "Camera access blocked",
      description: "Allow camera access for this site in your browser settings, then try again.",
      actions: (
        <>
          {tryAgain}
          {pasteInstead}
        </>
      ),
    }))
    .with({ kind: "no-camera" }, () => ({
      icon: <VideoOff />,
      title: "No camera found",
      description:
        "This device has no camera available. Enter the address by hand or paste it instead.",
      actions: pasteInstead,
    }))
    .with({ kind: "unsupported" }, () => ({
      icon: <CameraOff />,
      title: "Camera not available",
      description:
        "This browser cannot use the camera here (it requires a secure HTTPS connection). Enter the address by hand or paste it instead.",
      actions: pasteInstead,
    }))
    .with({ kind: "error" }, ({ message }) => ({
      icon: <CameraOff />,
      title: "Camera unavailable",
      description: message,
      actions: (
        <>
          {tryAgain}
          {pasteInstead}
        </>
      ),
    }))
    .exhaustive();

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera preview"
        className={cn("size-full object-cover", !!placeholder && "invisible")}
      />

      {placeholder ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
        >
          <span
            aria-hidden
            className="flex size-10 items-center justify-center rounded-md bg-background text-muted-foreground [&_svg]:size-5"
          >
            {placeholder.icon}
          </span>
          <div className="space-y-1">
            <p className="font-semibold">{placeholder.title}</p>
            {placeholder.description && (
              <p className="text-sm text-pretty text-muted-foreground">{placeholder.description}</p>
            )}
          </div>
          {placeholder.actions && (
            <div className="flex flex-wrap justify-center gap-2">{placeholder.actions}</div>
          )}
        </div>
      ) : (
        <>
          {/* Viewfinder: a clear square over a dimmed frame. Fixed white/black on purpose: it sits
              on a live camera image, not on a themed surface. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-[15%] rounded-md border-2 border-white/90 shadow-[0_0_0_100vmax_rgb(0_0_0/0.4)]"
          />
          <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white">
            Point the camera at a QR code
          </p>
        </>
      )}
    </div>
  );
}

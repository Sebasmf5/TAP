import jsQR from 'jsqr';
import { Camera, ImageUp, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button.tsx';

export function decodeQrFromCanvasSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, width, height, {
    inversionAttempts: 'attemptBoth',
  });
  return result?.data?.trim() || null;
}

/**
 * Extrae una ruta interna de Tap cuando el QR escaneado contiene una URL completa
 * (ej. https://tap.sebasmf.dev/c/FERIA1 -> /c/FERIA1).
 */
export function resolveTapInternalPath(rawQrValue: string): string | null {
  const trimmed = rawQrValue.trim();
  const routeMatch = /(\/(?:c|p|v)\/[A-Za-z0-9_-]+)/i.exec(trimmed);
  if (routeMatch?.[1]) {
    return routeMatch[1];
  }
  return null;
}

export interface QrScannerModalProps {
  readonly open: boolean;
  readonly title?: string;
  readonly description?: string;
  readonly onClose: () => void;
  readonly onDetected: (decodedValue: string) => void;
}

export function QrScannerModal({
  open,
  title = 'Escanear código QR',
  description = 'Apunta la cámara trasera del celular hacia el código QR o toma una fotografía.',
  onClose,
  onDetected,
}: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [streamReady, setStreamReady] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let mediaStream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          'Tu navegador no permite acceso directo a la cámara en este contexto. Usa el botón de tomar foto o subir imagen.',
        );
        return;
      }

      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
        }
        setCameraError(null);
        setStreamReady(true);

        scanTimer = setInterval(() => {
          const videoEl = videoRef.current;
          if (!videoEl || videoEl.readyState < 2) return;
          const decoded = decodeQrFromCanvasSource(
            videoEl,
            videoEl.videoWidth || 640,
            videoEl.videoHeight || 480,
          );
          if (decoded) {
            onDetected(decoded);
          }
        }, 250);
      } catch {
        if (!cancelled) {
          setStreamReady(false);
          setCameraError(
            'No fue posible abrir la cámara. Verifica los permisos o usa «Tomar foto / subir imagen QR».',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      if (scanTimer) clearInterval(scanTimer);
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open, facingMode, onDetected]);

  if (!open) return null;

  const handleImagePick = (file: File | undefined) => {
    if (!file) return;
    setCameraError(null);
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const decoded = decodeQrFromCanvasSource(img, img.naturalWidth, img.naturalHeight);
      URL.revokeObjectURL(objectUrl);
      if (decoded) {
        onDetected(decoded);
      } else {
        setCameraError('No se detectó ningún código QR legible en la imagen seleccionada.');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setCameraError('No fue posible leer la imagen seleccionada.');
    };
    img.src = objectUrl;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[var(--canvas)]/80 backdrop-blur-xs p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-md rounded-t-[var(--radius-card)] sm:rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-[var(--text-heading)]">{title}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar escáner QR"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--canvas)] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`h-full w-full object-cover ${cameraError ? 'hidden' : 'block'}`}
          />

          {/* Marco de enfoque visual para móvil */}
          {!cameraError && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-44 w-44 sm:h-48 sm:w-48">
                <span className="absolute top-0 left-0 h-6 w-6 border-t-2 border-l-2 border-[var(--action)]" />
                <span className="absolute top-0 right-0 h-6 w-6 border-t-2 border-r-2 border-[var(--action)]" />
                <span className="absolute bottom-0 left-0 h-6 w-6 border-b-2 border-l-2 border-[var(--action)]" />
                <span className="absolute bottom-0 right-0 h-6 w-6 border-b-2 border-r-2 border-[var(--action)]" />
              </div>
            </div>
          )}

          {!streamReady && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[var(--canvas)]/70 text-xs text-[var(--text-body)]">
              <Camera className="h-5 w-5 text-[var(--action)]" aria-hidden="true" />
              <span>Iniciando cámara…</span>
            </div>
          )}

          {cameraError && (
            <div className="p-4 text-center text-xs text-[var(--text-body)] space-y-2">
              <p className="text-[var(--status-danger-text)]">{cameraError}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              setCameraError(null);
              setStreamReady(false);
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Cambiar cámara
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              handleImagePick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageUp className="h-3.5 w-3.5" aria-hidden="true" />
            Tomar foto / imagen QR
          </Button>
        </div>
      </div>
    </div>
  );
}

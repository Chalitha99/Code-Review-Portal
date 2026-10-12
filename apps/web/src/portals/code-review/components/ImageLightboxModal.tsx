import { useCallback, useEffect, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from 'lucide-react';
import type { ReviewScreenshot } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { downloadScreenshot } from './screenshotNaming.ts';

export interface ImageLightboxModalProps {
  shot: ReviewScreenshot | null;
  shots?: readonly ReviewScreenshot[] | undefined;
  onClose: () => void;
  onSelectShot?: ((shot: ReviewScreenshot) => void) | undefined;
}

export function ImageLightboxModal({
  shot,
  shots,
  onClose,
  onSelectShot,
}: ImageLightboxModalProps) {
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [baseDimensions, setBaseDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [isPanning, setIsPanning] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const prevZoomRef = useRef(1);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Reset zoom and measured dimensions during render when the shot changes, so
  // the new image never paints with the previous zoom; the DOM scroll resets below.
  const shotKey = `${shot?.id ?? ''}|${shot?.storageRef ?? ''}`;
  const [viewedShotKey, setViewedShotKey] = useState(shotKey);
  if (viewedShotKey !== shotKey) {
    setViewedShotKey(shotKey);
    setZoom(1);
    setNaturalSize(null);
    setBaseDimensions(null);
  }

  useEffect(() => {
    prevZoomRef.current = 1;
    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }
  }, [shotKey]);

  // Compute base rendered dimensions within viewport
  const calculateBaseDimensions = useCallback((nw: number, nh: number) => {
    if (!viewportRef.current || nw <= 0 || nh <= 0) return;
    const vpWidth =
      viewportRef.current.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth * 0.9 : 1200);
    const vpHeight =
      viewportRef.current.clientHeight ||
      (typeof window !== 'undefined' ? window.innerHeight * 0.78 : 800);
    const paddingX = 32;
    const paddingY = 32;
    const availW = Math.max(vpWidth - paddingX, 100);
    const availH = Math.max(vpHeight - paddingY, 100);

    const imgAspect = nw / nh;
    const vpAspect = availW / availH;

    let baseW: number;
    let baseH: number;

    if (imgAspect > vpAspect) {
      // Width-constrained
      baseW = availW;
      baseH = availW / imgAspect;
    } else {
      // Height-constrained (tall screenshots)
      baseH = availH;
      baseW = availH * imgAspect;
    }

    setBaseDimensions({ width: Math.round(baseW), height: Math.round(baseH) });
  }, []);

  const handleImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
        calculateBaseDimensions(img.naturalWidth, img.naturalHeight);
      }
    },
    [calculateBaseDimensions],
  );

  // If already complete on render (cached or data URL)
  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0 && !naturalSize) {
      setNaturalSize({
        width: imageRef.current.naturalWidth,
        height: imageRef.current.naturalHeight,
      });
      calculateBaseDimensions(imageRef.current.naturalWidth, imageRef.current.naturalHeight);
    }
  }, [shot?.id, shot?.storageRef, naturalSize, calculateBaseDimensions]);

  // Re-calculate base dimensions on window resize
  useEffect(() => {
    function handleResize() {
      if (naturalSize) {
        calculateBaseDimensions(naturalSize.width, naturalSize.height);
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [naturalSize, calculateBaseDimensions]);

  // Preserve center of viewport when zooming in/out
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    if (prevZoomRef.current !== zoom) {
      const ratio = zoom / prevZoomRef.current;
      prevZoomRef.current = zoom;

      if (zoom === 1) {
        vp.scrollTop = 0;
        vp.scrollLeft = 0;
      } else {
        const centerX = vp.scrollLeft + vp.clientWidth / 2;
        const centerY = vp.scrollTop + vp.clientHeight / 2;
        const newScrollLeft = centerX * ratio - vp.clientWidth / 2;
        const newScrollTop = centerY * ratio - vp.clientHeight / 2;
        vp.scrollLeft = Math.max(0, Math.round(newScrollLeft));
        vp.scrollTop = Math.max(0, Math.round(newScrollTop));
      }
    }
  }, [zoom]);

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        // Wheel Up -> Zoom In
        setZoom((z) => Math.min(+(z + 0.25).toFixed(2), 3));
      } else if (e.deltaY > 0) {
        // Wheel Down -> Zoom Out
        setZoom((z) => Math.max(+(z - 0.25).toFixed(2), 0.5));
      }
    }
  }

  // Ensure non-passive wheel prevention so browser page doesn't zoom
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    function onNativeWheel(e: WheelEvent) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    }

    vp.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onNativeWheel);
  }, [shot?.id]);

  // Pointer panning handlers for click-drag when zoomed
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (zoom <= 1 || e.button !== 0) return;
    setIsPanning(true);
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: viewportRef.current?.scrollLeft ?? 0,
      scrollTop: viewportRef.current?.scrollTop ?? 0,
    };
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPanning || !viewportRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    viewportRef.current.scrollLeft = startPosRef.current.scrollLeft - dx;
    viewportRef.current.scrollTop = startPosRef.current.scrollTop - dy;
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (isPanning) {
      setIsPanning(false);
      if (typeof e.currentTarget.releasePointerCapture === 'function') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
    }
  }

  const currentIndex = shot && shots ? shots.findIndex((s) => s.id === shot.id) : -1;
  const hasMultiple = Boolean(shots && shots.length > 1 && currentIndex !== -1);
  const hasPrev = hasMultiple && currentIndex > 0;
  const hasNext = hasMultiple && currentIndex < (shots?.length ?? 0) - 1;

  function handlePrev() {
    if (shots && hasPrev && onSelectShot) {
      const target = shots[currentIndex - 1];
      if (target) onSelectShot(target);
    }
  }

  function handleNext() {
    if (shots && hasNext && onSelectShot) {
      const target = shots[currentIndex + 1];
      if (target) onSelectShot(target);
    }
  }

  useEffect(() => {
    if (!shot || !hasMultiple || !shots || !onSelectShot) return;
    function handleKeyDown(e: KeyboardEvent) {
      const offset =
        e.key === 'ArrowLeft' && hasPrev ? -1 : e.key === 'ArrowRight' && hasNext ? 1 : 0;
      if (offset === 0) return;
      e.preventDefault();
      const target = shots?.[currentIndex + offset];
      if (target) onSelectShot?.(target);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shot, hasMultiple, hasPrev, hasNext, currentIndex, shots, onSelectShot]);

  if (!shot) return null;

  const sizeKb = (shot.sizeBytes / 1024).toFixed(0);
  const rawExt = shot.fileName.split('.').pop()?.toUpperCase() ?? '';
  const ext = rawExt === '' ? 'IMAGE' : rawExt;

  function handleZoomIn() {
    setZoom((z) => Math.min(+(z + 0.25).toFixed(2), 3));
  }

  function handleZoomOut() {
    setZoom((z) => Math.max(+(z - 0.25).toFixed(2), 0.5));
  }

  function handleZoomReset() {
    setZoom(1);
  }

  const scaledWidth = baseDimensions ? Math.round(baseDimensions.width * zoom) : undefined;
  const scaledHeight = baseDimensions ? Math.round(baseDimensions.height * zoom) : undefined;

  return (
    <RadixDialog.Root
      open={Boolean(shot)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="bg-ink-950/85 animate-in fade-in-0 fixed inset-0 z-50 backdrop-blur-md duration-200" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col justify-between p-3 outline-none select-none focus:outline-none sm:p-5"
        >
          {/* Top Bar - Strictly fixed/sticky outside scroll container */}
          <div
            data-testid="lightbox-toolbar"
            className="z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/90 px-4 py-2.5 shadow-lg backdrop-blur-md"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="min-w-0">
                <RadixDialog.Title
                  className="truncate text-sm font-bold text-ink-900"
                  title={shot.fileName}
                >
                  {shot.fileName}
                </RadixDialog.Title>
                <p className="text-2xs font-medium text-ink-500">
                  {ext} • {sizeKb} KB
                  {hasMultiple && ` • ${currentIndex + 1} of ${shots!.length}`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/* Previous / Next Navigation Controls in Toolbar */}
              {hasMultiple && (
                <div className="mr-1 flex items-center gap-1 rounded-lg border border-line bg-canvas/60 p-0.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    disabled={!hasPrev}
                    className="text-ink-600 cursor-pointer rounded p-1 transition-colors hover:bg-canvas hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Previous screenshot (Left arrow)"
                    aria-label="Previous screenshot"
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </button>
                  <span className="text-2xs px-1 font-bold text-ink-700 select-none">
                    {currentIndex + 1} / {shots!.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!hasNext}
                    className="text-ink-600 cursor-pointer rounded p-1 transition-colors hover:bg-canvas hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Next screenshot (Right arrow)"
                    aria-label="Next screenshot"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {/* Zoom Controls */}
              <div className="mr-1.5 flex items-center overflow-hidden rounded-lg border border-line bg-canvas/60">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.5}
                  className="text-ink-600 cursor-pointer p-1.5 transition-colors hover:bg-canvas hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Zoom out"
                  aria-label="Zoom out"
                >
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleZoomReset}
                  className="text-2xs cursor-pointer border-x border-line/60 px-2 py-1 font-bold text-ink-700 transition-colors hover:bg-canvas"
                  title="Reset zoom to 100%"
                  aria-label="Reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="text-ink-600 cursor-pointer p-1.5 transition-colors hover:bg-canvas hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Zoom in"
                  aria-label="Zoom in"
                >
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </div>

              {/* Download Action */}
              <button
                type="button"
                onClick={() => downloadScreenshot(shot)}
                className="text-ink-800 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors hover:bg-canvas"
                title="Download screenshot"
                aria-label="Download screenshot"
              >
                <Download className="text-ink-600 size-3.5" aria-hidden="true" />
                <span>Download</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="ml-1 cursor-pointer rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
                title="Close lightbox"
                aria-label="Close lightbox"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Center Image Container with Dedicated Scrollable Viewport & Floating Side Navigators */}
          <div className="relative my-2 flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* Floating Prev Chevron */}
            {hasPrev && (
              <button
                type="button"
                onClick={handlePrev}
                className="text-ink-800 hover:text-ink-950 absolute top-1/2 left-3 z-30 -translate-y-1/2 cursor-pointer rounded-full border border-line bg-surface/85 p-2.5 shadow-lg backdrop-blur-md transition-all hover:bg-surface"
                title="Previous screenshot (Left arrow)"
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            )}

            {/* Dedicated Scrollable Image Viewport */}
            <div
              ref={viewportRef}
              data-testid="lightbox-viewport"
              role="region"
              // Focusable only while zoomed, when it scrolls and keyboard users need to pan.
              tabIndex={zoom > 1 ? 0 : -1}
              aria-label="Screenshot image viewport"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
              className={cn(
                'h-full w-full touch-pan-x touch-pan-y overflow-auto p-4 focus:outline-hidden',
                zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-default',
              )}
              style={{
                display: 'flex',
              }}
            >
              <div
                data-testid="lightbox-canvas"
                className="zoom-canvas"
                style={{
                  margin: 'auto',
                  flexShrink: 0,
                  width:
                    scaledWidth !== undefined
                      ? `${scaledWidth}px`
                      : zoom > 1
                        ? `${Math.round(zoom * 100)}%`
                        : 'auto',
                  height: scaledHeight !== undefined ? `${scaledHeight}px` : 'auto',
                  maxWidth: scaledWidth !== undefined ? undefined : `${Math.min(zoom * 88, 600)}vw`,
                  maxHeight:
                    scaledHeight !== undefined ? undefined : `${Math.min(zoom * 78, 600)}vh`,
                  transition: isPanning ? 'none' : 'width 150ms ease-out, height 150ms ease-out',
                }}
              >
                <img
                  ref={imageRef}
                  src={shot.storageRef}
                  alt={shot.fileName}
                  onLoad={handleImageLoad}
                  className="pointer-events-none block h-full w-full rounded-lg object-contain shadow-2xl ring-1 ring-white/10 select-none"
                />
              </div>
            </div>

            {/* Floating Next Chevron */}
            {hasNext && (
              <button
                type="button"
                onClick={handleNext}
                className="text-ink-800 hover:text-ink-950 absolute top-1/2 right-3 z-30 -translate-y-1/2 cursor-pointer rounded-full border border-line bg-surface/85 p-2.5 shadow-lg backdrop-blur-md transition-all hover:bg-surface"
                title="Next screenshot (Right arrow)"
                aria-label="Next screenshot"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Bottom Bar Hints - Strictly fixed */}
          <div className="z-20 shrink-0 text-center">
            <span className="text-2xs inline-block rounded-full border border-line/60 bg-surface/80 px-3 py-1 text-ink-400 backdrop-blur-sm">
              {hasMultiple
                ? 'Press Escape to close • Use ← and → arrow keys to navigate screenshots'
                : 'Press Escape or click Close to return'}
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

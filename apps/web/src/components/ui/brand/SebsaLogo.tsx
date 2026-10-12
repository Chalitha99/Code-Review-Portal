import { useId } from 'react';
import { cn } from '../lib/cn.js';
import {
  LOGO_GRADIENTS,
  SOLID_FILL,
  TAGLINE_FILL,
  TAGLINE_PATHS,
  VIEWBOX_FULL,
  VIEWBOX_MARK,
  WORDMARK_PATHS,
} from './sebsaLogoPaths.js';

export type SebsaLogoTone = 'brand' | 'inverse' | 'mono';

export interface SebsaLogoProps {
  /**
   * Rendered height in pixels. Width follows from the artwork's aspect ratio,
   * so the mark can never be stretched by a caller.
   */
  height?: number;
  /**
   * `brand` keeps the official colours. `inverse` renders the artwork in white
   * for placement on the brand gradient or any dark field. `mono` renders it in
   * the current text colour, for print and single-colour contexts.
   */
  tone?: SebsaLogoTone;
  /**
   * The tagline is set at roughly 12 units in a 79-unit viewBox, so below about
   * 28px tall it degrades into grey noise. `auto` keeps it only when it can
   * actually be read.
   */
  tagline?: 'auto' | 'always' | 'never';
  /** Accessible name. Pass `''` when an adjacent element already names it. */
  title?: string;
  className?: string;
}

/** Below this rendered height the tagline is not legible, so it is dropped. */
const TAGLINE_LEGIBILITY_THRESHOLD_PX = 28;

/**
 * The official SEBSA mark.
 *
 * Inline SVG rather than an `<img>` so that:
 *  - the gradient IDs can be scoped per instance (`useId`), which an `<img>` or
 *    a naive SVG import cannot do — two logos on one page would otherwise share
 *    one ID and the second would lose its fill;
 *  - the artwork can be recoloured for dark surfaces without shipping a second
 *    asset that could drift from the first;
 *  - it stays vector, so it is crisp at any DPI by construction.
 *
 * Colours are never altered in `brand` tone — the fills come straight from the
 * official file (see `sebsaLogoPaths.ts`).
 */
export function SebsaLogo({
  height = 36,
  tone = 'brand',
  tagline = 'auto',
  title = 'SEBSA',
  className,
}: SebsaLogoProps) {
  // Scoped so multiple instances cannot collide on `url(#…)` references.
  const rawId = useId();
  const primaryId = `sebsa-grad-primary-${rawId}`;
  const secondaryId = `sebsa-grad-secondary-${rawId}`;
  const titleId = `sebsa-title-${rawId}`;

  const showTagline =
    tagline === 'always' || (tagline === 'auto' && height >= TAGLINE_LEGIBILITY_THRESHOLD_PX);

  const viewBox = showTagline ? VIEWBOX_FULL : VIEWBOX_MARK;
  const aspectRatio = showTagline ? 374.77 / 79.05 : 374.77 / 56;

  const fillFor = (kind: (typeof WORDMARK_PATHS)[number]['tone']): string => {
    if (tone === 'inverse') return '#ffffff';
    if (tone === 'mono') return 'currentColor';
    if (kind === 'gradient-1') return `url(#${primaryId})`;
    if (kind === 'gradient-2') return `url(#${secondaryId})`;
    return SOLID_FILL;
  };

  const taglineFill =
    tone === 'inverse'
      ? 'rgb(255 255 255 / 0.72)'
      : tone === 'mono'
        ? 'currentColor'
        : TAGLINE_FILL;

  const isDecorative = title === '';

  return (
    <svg
      viewBox={viewBox}
      height={height}
      width={height * aspectRatio}
      // Explicit ratio preservation: a caller sizing by CSS cannot squash it.
      preserveAspectRatio="xMidYMid meet"
      className={cn('block', className)}
      role={isDecorative ? 'presentation' : 'img'}
      {...(isDecorative ? { 'aria-hidden': true } : { 'aria-labelledby': titleId })}
    >
      {isDecorative ? null : <title id={titleId}>{title}</title>}

      {tone === 'brand' ? (
        <defs>
          <linearGradient
            id={primaryId}
            gradientUnits="userSpaceOnUse"
            x1={LOGO_GRADIENTS.primary.x1}
            y1={LOGO_GRADIENTS.primary.y1}
            x2={LOGO_GRADIENTS.primary.x2}
            y2={LOGO_GRADIENTS.primary.y2}
          >
            {LOGO_GRADIENTS.primary.stops.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
          <linearGradient
            id={secondaryId}
            gradientUnits="userSpaceOnUse"
            x1={LOGO_GRADIENTS.secondary.x1}
            y1={LOGO_GRADIENTS.secondary.y1}
            x2={LOGO_GRADIENTS.secondary.x2}
            y2={LOGO_GRADIENTS.secondary.y2}
          >
            {LOGO_GRADIENTS.secondary.stops.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </linearGradient>
        </defs>
      ) : null}

      {WORDMARK_PATHS.map((path) => (
        <path key={path.d.slice(0, 24)} d={path.d} fill={fillFor(path.tone)} />
      ))}

      {showTagline
        ? TAGLINE_PATHS.map((d) => <path key={d.slice(0, 24)} d={d} fill={taglineFill} />)
        : null}
    </svg>
  );
}

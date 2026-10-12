import { FrameStyle } from '../core/profile';

/** Onde ficam os desenhos das molduras (public/molduras), a partir do endereço do site. */
const BASE = new URL('molduras/', document.baseURI).href;

/** As molduras desenhadas, cortadas pelo border-image (ver scripts/molduras.py). */
const DRAWN: ReadonlySet<FrameStyle> = new Set<FrameStyle>(['bambu', 'corda', 'filme', 'selo', 'croche', 'pixel']);

/** O valor de --moldura-arte de uma moldura (null: ela é toda feita no CSS). */
export function frameArt(frame: FrameStyle): string | null {
  return DRAWN.has(frame) ? `url("${BASE}${frame}.svg")` : null;
}

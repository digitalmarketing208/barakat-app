// Metal palettes for the membership cards. Pure functions, no React Native: every colour is derived from
// src/theme.ts tokens with mix(), so a brand change in theme.ts flows through. Tested in membership.test.ts.
import { colors } from '../theme';
import type { TierName } from './rewardsApi';

const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: [number, number, number]) =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Blend two '#RRGGBB' colours: t=0 gives a, t=1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a), y = toRgb(b), k = Math.max(0, Math.min(1, t));
  return toHex([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}
/** Lighter (amt > 0, towards the card white) or darker (amt < 0, towards the darkest brand tone). */
export const shade = (hex: string, amt: number): string => (amt >= 0 ? mix(hex, colors.card, amt) : mix(hex, colors.dark, -amt));

export type MetalKind = TierName | 'plus' | 'max';
export interface Metal {
  /** four gradient stops, dark to lighter, top-left to bottom-right */
  stops: [string, string, string, string];
  /** hairline border and small details */
  edge: string;
  /** accent for numbers, rings and icons */
  accent: string;
  text: string;
  textSoft: string;
  /** embossed text: the shadow colour pressed under the lettering */
  emboss: string;
}

export function metalFor(kind: MetalKind): Metal {
  const { dark, maroon, red, text, muted, beige, amber, card } = colors;
  switch (kind) {
    case 'silver':
    case 'plus': // silver tone: graphite to brushed steel
      return {
        stops: [text, mix(text, muted, 0.45), mix(text, muted, 0.78), mix(text, muted, 0.4)],
        edge: mix(muted, beige, 0.55), accent: beige, text: card, textSoft: mix(card, muted, 0.25), emboss: mix(text, dark, 0.5),
      };
    case 'gold':
    case 'max': // gold on black
      return {
        stops: [mix(text, dark, 0.5), mix(text, amber, 0.16), mix(text, amber, 0.34), mix(dark, amber, 0.42)],
        edge: mix(amber, dark, 0.2), accent: amber, text: card, textSoft: mix(card, amber, 0.3), emboss: mix(dark, text, 0.5),
      };
    default: // member: Barakat maroon
      return {
        stops: [dark, mix(dark, maroon, 0.6), maroon, mix(maroon, red, 0.4)],
        edge: mix(maroon, beige, 0.4), accent: beige, text: card, textSoft: mix(card, beige, 0.3), emboss: mix(dark, text, 0.4),
      };
  }
}

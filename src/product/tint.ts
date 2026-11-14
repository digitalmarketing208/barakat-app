import { colors } from '../theme';

/** Translucent version of a theme colour, so screens never hardcode colour values. */
export const alpha = (hex: string, a: number) => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export const tint = {
  white: colors.card,
  redSoft: alpha(colors.red, 0.07),
  redLine: alpha(colors.red, 0.25),
  successSoft: alpha(colors.success, 0.1),
  amberSoft: alpha(colors.amber, 0.18),
  scrim: alpha(colors.dark, 0.45),
  glass: alpha(colors.card, 0.92),
};

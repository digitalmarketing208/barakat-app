import { colors } from '../theme';

// Translucent / derived colours are computed from the theme palette so no colour literal lives outside theme.ts.
export const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
export const white = colors.card;
export const clear = alpha(colors.card, 0);

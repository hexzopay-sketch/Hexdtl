/**
 * ANSI 256-color palette helpers and htop-style theme constants.
 */

// Standard ANSI colors (0-15)
export const BLACK = 0;
export const RED = 1;
export const GREEN = 2;
export const YELLOW = 3;
export const BLUE = 4;
export const MAGENTA = 5;
export const CYAN = 6;
export const WHITE = 7;
export const BRIGHT_BLACK = 8;
export const BRIGHT_RED = 9;
export const BRIGHT_GREEN = 10;
export const BRIGHT_YELLOW = 11;
export const BRIGHT_BLUE = 12;
export const BRIGHT_MAGENTA = 13;
export const BRIGHT_CYAN = 14;
export const BRIGHT_WHITE = 15;

// htop-inspired theme
export const THEME = {
  // Header bar
  headerBg: BRIGHT_BLUE,
  headerFg: WHITE,
  headerBold: true,

  // Status bar
  statusBarBg: BLACK,
  statusBarFg: BRIGHT_CYAN,
  statusBarKeyFg: BRIGHT_YELLOW,

  // Panel tabs
  tabActive: { fg: BLACK, bg: CYAN, bold: true },
  tabInactive: { fg: WHITE, bg: BRIGHT_BLACK },
  tabHover: { fg: BLACK, bg: BRIGHT_GREEN },

  // Runtime feed
  feedTimestamp: BRIGHT_BLACK,
  feedLog: WHITE,
  feedInfo: BLUE,
  feedWarn: BRIGHT_YELLOW,
  feedError: BRIGHT_RED,
  feedDebug: BRIGHT_BLACK,
  feedTrace: MAGENTA,
  feedTable: CYAN,
  feedException: BRIGHT_RED,
  feedExec: GREEN,

  // Network
  netMethodGet: GREEN,
  netMethodPost: YELLOW,
  netMethodPut: CYAN,
  netMethodDelete: RED,
  netStatusOk: GREEN,
  netStatusWarn: YELLOW,
  netStatusErr: RED,
  netUrl: WHITE,
  netTime: BRIGHT_BLACK,
  netHeader: BRIGHT_BLACK,

  // Console
  promptFg: CYAN,
  inputFg: WHITE,
  resultOk: WHITE,
  resultErr: BRIGHT_RED,

  // Sources
  srcFile: GREEN,
  srcDecrypted: BRIGHT_YELLOW,
  srcLines: BRIGHT_BLACK,
  srcSelected: { fg: BLACK, bg: GREEN, bold: true },
  srcKeyword: BLUE,
  srcString: GREEN,
  srcComment: BRIGHT_BLACK,
  srcNumber: MAGENTA,
  srcFunction: CYAN,

  // General
  border: BRIGHT_BLACK,
  dimText: BRIGHT_BLACK,
  highlight: { fg: BLACK, bg: YELLOW, bold: true },
  error: BRIGHT_RED,
  success: GREEN,
  warning: BRIGHT_YELLOW,
} as const;

/**
 * Convert an RGB triplet [r,g,b] to the nearest ANSI 256-color index.
 */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // 6x6x6 color cube
  const ri = Math.round((r / 255) * 5);
  const gi = Math.round((g / 255) * 5);
  const bi = Math.round((b / 255) * 5);
  return 16 + 36 * ri + 6 * gi + bi;
}

/**
 * Convert hex color string to ANSI 256-color index.
 */
export function hexToAnsi256(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return rgbToAnsi256(r, g, b);
}

/**
 * Compute a contrast color (black or white) for text on a given background.
 */
export function contrastColor(bgAnsi: number): number {
  if (bgAnsi < 0) return WHITE;
  // Simple heuristic: bright backgrounds get dark text
  if (bgAnsi >= 8 && bgAnsi <= 15) return BLACK;
  if (bgAnsi >= 232) return WHITE; // dark grayscale
  return WHITE;
}

/**
 * Gradient colors for network timing bars (like htop's CPU bars).
 */
export const TIMING_GRADIENT = [
  GREEN, GREEN, GREEN,
  BRIGHT_GREEN, BRIGHT_GREEN,
  YELLOW, YELLOW,
  BRIGHT_YELLOW,
  RED, BRIGHT_RED,
];

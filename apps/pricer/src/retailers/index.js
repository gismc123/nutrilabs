import { kroger } from './kroger.js';

// Kroger only. Meijer, ALDI and Sam's Club were removed on 2026-11-26.
export const RETAILERS = { kroger };
export const ACTIVE_IDS = Object.keys(RETAILERS);

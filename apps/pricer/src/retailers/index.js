import { kroger } from './kroger.js';
import { meijer } from './meijer.js';
import { aldi } from './aldi.js';
import { samsclub } from './samsclub.js';
import { disabledRetailers } from './disabled.js';

export const RETAILERS = { kroger, meijer, aldi, samsclub };
export const DISABLED = disabledRetailers;
export const ACTIVE_IDS = Object.keys(RETAILERS);

// Parse package sizes ("15.25 oz", "1 gal", "18 ct", "15 oz., 6 pk.", "12 lbs.",
// "1/2 gallon") into a base quantity so pack sizes can be compared per unit.

const WEIGHT_OZ = { oz: 1, ounce: 1, ounces: 1, onz: 1, lb: 16, lbs: 16, pound: 16, pounds: 16, g: 0.035274, kg: 35.274 };
const VOLUME_FLOZ = { 'fl oz': 1, gal: 128, gallon: 128, qt: 32, quart: 32, pt: 16, pint: 16, l: 33.814, ml: 0.033814 };

const NUMBER = String.raw`(\d+\s\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)`;

function toNumber(text) {
  const parts = text.trim().split(/\s+/);
  return parts.reduce((sum, part) => {
    if (part.includes('/')) {
      const [n, d] = part.split('/').map(Number);
      return sum + n / d;
    }
    return sum + Number(part);
  }, 0);
}

export function parseSize(text) {
  if (!text) return null;
  const t = ` ${String(text).toLowerCase().replace(/,|\.(?!\d)/g, ' ').replace(/\s+/g, ' ')} `;

  const measure = t.match(new RegExp(`${NUMBER}\\s*(fl oz|oz|onz|ounces?|lbs?|pounds?|kg|g|gal(?:lon)?|qt|quart|pt|pint|ml|l)\\b`));
  if (measure) {
    const amount = toNumber(measure[1]);
    const unit = measure[2];
    // "15 oz, 6 pk" is six 15 oz cans.
    const pack = t.match(/(\d+)\s*(?:pk|pack)\b/);
    const multiplier = pack ? Number(pack[1]) : 1;
    if (WEIGHT_OZ[unit] != null) return { base: amount * WEIGHT_OZ[unit] * multiplier, unit: 'oz' };
    if (VOLUME_FLOZ[unit] != null) return { base: amount * VOLUME_FLOZ[unit] * multiplier, unit: 'fl oz' };
  }

  const count = t.match(/(\d+)\s*(ct|count|each|ea|pk|pack)\b/);
  if (count) return { base: Number(count[1]), unit: 'ct' };
  return null;
}

export function unitPrice(price, sizeText) {
  const size = parseSize(sizeText);
  if (!size || !size.base || price == null) return null;
  const per = price / size.base;
  return { value: Math.round(per * 1000) / 1000, unit: size.unit, label: `$${per < 0.1 ? per.toFixed(3) : per.toFixed(2)}/${size.unit}` };
}

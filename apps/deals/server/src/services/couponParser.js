// Turn one raw Kroger coupon (v2 compact projection, see COUPON-SCHEMA.md) into the
// fields we store. `value` means different things per discount type, so classify first.
import { isFood } from '../lib/categories.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : v != null && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);

function date(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Price written as "$2.49", "$10", "58¢".
function priceFrom(text) {
  const m = String(text).match(/\$\s?(\d+(?:\.\d{1,2})?)|(\d+)\s?¢|^\s*(\d+\.\d{2})\b/);
  if (!m) return null;
  if (m[1]) return Number(m[1]);
  return m[2] ? Number(m[2]) / 100 : Number(m[3]);
}

export function classify(raw) {
  const title = String(raw.title || '').trim();
  const desc = String(raw.shortDescription || raw.displayDescription || '').trim();
  const text = `${title} ${desc}`;
  const value = num(raw.value ?? raw.savings);
  const special = (raw.specialSavings || []).map((s) => s?.name).filter(Boolean);
  const reqs = Array.isArray(raw.requirements) ? raw.requirements : [];
  const spendReq = reqs.find((r) => r?.type === 'SPEND');
  const qtyReqs = reqs.filter((r) => r?.type === 'QUANTITY').map((r) => num(r.amount) || 1);

  const out = { discountType: 'UNKNOWN', amountOff: null, percentOff: null, fixedPrice: null, perLb: false };

  if (/\bpoints?\b/i.test(title) || special.includes('POINTS') || /\b\d+x\b/i.test(title)) {
    out.discountType = 'POINTS';
  } else if (/delivery|membership|boost/i.test(title) && !/\bon\b/i.test(title)) {
    out.discountType = 'SERVICE';
  } else if (/^\s*(\$\s?\d|\d+\s?¢|\d+\.\d{2}\b)/.test(title)) {
    // "$2.49", "17.99 PS Cheesecakes", or "58¢/lb Kroger Frozen Turkey": the coupon sets the price.
    out.discountType = 'FIXED_PRICE';
    out.fixedPrice = priceFrom(title) ?? value;
    out.perLb = /\/\s?lb|\blb\b/i.test(title) || /\$?\d[\d.]*\s?(¢)?\s?\/?\s?lb\b/i.test(desc);
  } else if (/buy\s+\d+.*get\s+\d+\s+free|bogo|buy one,? get one free/i.test(text)) {
    out.discountType = 'BOGO';
  } else if (/free with purchase/i.test(title)) {
    out.discountType = 'FREE_WITH_PURCHASE';
  } else if (/\d+\s?%/.test(title)) {
    out.discountType = 'PERCENT_OFF';
    out.percentOff = num(title.match(/(\d+(?:\.\d+)?)\s?%/)[1]) ?? value;
  } else if (/save|off/i.test(title) && (value != null || priceFrom(title) != null)) {
    out.discountType = 'AMOUNT_OFF';
    out.amountOff = priceFrom(title) ?? value;
  }

  // Quantity: "Save $3.00 on 2", or the largest QUANTITY requirement, else requirementQuantity.
  const onN = title.match(/\bon\s+(\d+)\b/i) || desc.match(/\bbuy\s+(\d+)\b/i) || desc.match(/\bon\s+(?:any\s+)?(\d+)\b/i);
  let minQuantity = onN ? Number(onN[1]) : Math.max(1, ...qtyReqs, 0);
  if (!spendReq && !onN && num(raw.requirementQuantity) > 0 && num(raw.requirementQuantity) < 20) {
    minQuantity = Math.max(minQuantity, num(raw.requirementQuantity));
  }
  if (out.discountType === 'BOGO' || (out.discountType === 'PERCENT_OFF' && /with purchase/i.test(title))) {
    minQuantity = Math.max(minQuantity, 2);
  }
  out.minQuantity = Math.min(Math.max(1, minQuantity || 1), 20);
  out.minSpend = spendReq ? num(spendReq.amount) : null;

  return out;
}

export function parseCoupon(raw, { signedIn = false } = {}) {
  const c = classify(raw);
  const categories = Array.isArray(raw.categories) ? raw.categories.filter(Boolean) : [];
  const special = (raw.specialSavings || []).map((s) => s?.name).filter(Boolean);
  const modalities = Array.isArray(raw.modalities) ? raw.modalities : [];
  const redemptions = num(raw.redemptionsAllowed);
  const brand = raw.brand && raw.brand !== 'Other' ? String(raw.brand).trim() : null;
  // "General" holds some food (Bob Evans, PS Cheesecakes); matching decides.
  const grocery = (isFood(categories) || categories.includes('General')) && !['POINTS', 'SERVICE', 'UNKNOWN'].includes(c.discountType) && !c.minSpend;

  return {
    id: String(raw.id),
    offerId: raw.offerId ? String(raw.offerId) : null,
    couponNumber: raw.krogerCouponNumber ? String(raw.krogerCouponNumber) : null,
    title: String(raw.title || raw.shortDescription || 'Coupon').slice(0, 300),
    description: String(raw.shortDescription || raw.displayDescription || raw.title || '').slice(0, 1000),
    terms: raw.requirementDescription ? String(raw.requirementDescription).slice(0, 4000) : null,
    brand,
    categories,
    ...c,
    usageLimit: redemptions != null && redemptions > 0 ? redemptions : null,
    pickupDeliveryOnly: modalities.length > 0 && !modalities.includes('IN_STORE'),
    weeklyDigitalDeal: special.includes('WDD'),
    specialSavings: special,
    clipped: signedIn ? !!raw.addedToCard : false,
    imageUrl: typeof raw.imageUrl === 'string' && raw.imageUrl.startsWith('https://') ? raw.imageUrl : null,
    startDate: date(raw.displayStartDate),
    expiryDate: date(raw.expirationDate || raw.displayEndDate),
    grocery,
  };
}

// Dollar effect of a coupon on one product at a known shelf price.
// Returns null when the coupon has no dependable cash value for that product.
export function applyCoupon(coupon, basePrice, { soldBy, regular } = {}) {
  if (basePrice == null || basePrice <= 0) return null;
  const qty = coupon.minQuantity || 1;
  let each = null;
  switch (coupon.discountType) {
    case 'AMOUNT_OFF':
      if (coupon.amountOff == null) return null;
      each = basePrice - coupon.amountOff / qty;
      break;
    case 'PERCENT_OFF':
      if (coupon.percentOff == null) return null;
      // "Save 50% with Purchase" = the second item is half off.
      each = qty >= 2 && /with purchase/i.test(coupon.title)
        ? basePrice * (1 - coupon.percentOff / 100 / qty)
        : basePrice * (1 - coupon.percentOff / 100);
      break;
    case 'FIXED_PRICE':
      if (coupon.fixedPrice == null) return null;
      // Per-lb deals only compare cleanly with items sold by weight.
      if (coupon.perLb && soldBy !== 'WEIGHT') return null;
      each = Math.min(basePrice, coupon.fixedPrice);
      // Weekly digital deals name one size. A price cut deeper than 55%, or a
      // product much pricier than the smallest matched size, is most likely a
      // bigger size the deal does not cover.
      if (coupon.fixedPrice < 0.45 * basePrice || (coupon.sizeRefPrice && (regular ?? basePrice) > 1.35 * coupon.sizeRefPrice)) {
        const e = Math.round(each * 100) / 100;
        return { each: e, quantity: 1, savingsEach: Math.round((basePrice - e) * 100) / 100, sizeUncertain: true };
      }
      break;
    case 'BOGO':
      each = (basePrice * Math.max(1, qty - 1)) / qty;
      break;
    default:
      return null;
  }
  each = Math.max(0, Math.round(each * 100) / 100);
  if (each >= basePrice) return null;
  return { each, quantity: qty, savingsEach: Math.round((basePrice - each) * 100) / 100 };
}

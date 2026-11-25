// Text normalization shared by search, coupon parsing, and matching.

export function fold(s) {
  return String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[®™©]/g, '')
    .toLowerCase();
}

// Words that say nothing about which product a coupon or search means.
const STOP = new Set(`a an and any or of on the for with to in by at from your you get save buy off only
each per oz ct lb lbs pk pack packs count size select selected varieties variety participating products product
item items all other more new big value pickup delivery when spend purchase free total valid kroger stores
assorted flavors flavor kinds types type plus also`.split(/\s+/));

export function tokens(s) {
  return fold(s)
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/, ''))
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));
}

// Crude singular form, good enough for grocery words (tomatoes, berries, loaves).
export function singular(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (/ves$/.test(w)) return `${w.slice(0, -3)}f`;
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

// Same product, different words on the coupon and the shelf.
const SYNONYMS = { mayonnaise: 'mayo', yoghurt: 'yogurt', catsup: 'ketchup', veggie: 'vegetable', veggy: 'vegetable', choc: 'chocolate' };

export const stems = (s) => tokens(s).map(singular).map((w) => SYNONYMS[w] ?? w);

// Describe a product without naming it. They never make a coupon link on their own.
export const DESCRIPTORS = new Set(`frozen fresh large small medium jumbo mini grade sliced shredded organic original classic
light lite real family deal style natural premium select regular plain sweet whole boneless skinless raw cooked
fully refrigerated reduced fat free low sodium sugar zero diet lean extra sharp mild hot spicy seasoned
unsweetened salted unsalted roasted baked bake ready instant traditional homestyle signature favorite
department valid nashville tn ky al ga in store stores bottle bottles can cans box boxes bag bags jar
pouch bar bars tray trays loaf multipack 12pk 6pk 24pk stick sticks single singles meat`.split(/\s+/));

export function brandKey(s) {
  return fold(s).replace(/[^a-z0-9]+/g, '');
}

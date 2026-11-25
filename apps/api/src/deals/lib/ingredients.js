// Turn recipe wording ("2 cloves garlic, minced") into shelf wording ("garlic")
// and produce a few query forms to try in order.
import { fold } from './text.js';

// Recipe phrase -> what the shelf calls it. Checked after cleanup, longest first.
const SHELF_NAMES = {
  'garlic clove': 'garlic',
  'clove garlic': 'garlic',
  'cloves garlic': 'garlic',
  'garlic cloves': 'garlic',
  scallion: 'green onions',
  scallions: 'green onions',
  'spring onion': 'green onions',
  'cilantro leaves': 'cilantro',
  'fresh cilantro': 'cilantro',
  'chicken breast': 'boneless skinless chicken breast',
  'chicken breasts': 'boneless skinless chicken breast',
  'chicken thigh': 'chicken thighs',
  'ground beef': 'ground beef',
  'lean ground beef': 'ground beef 90/10',
  'egg': 'eggs',
  'large egg': 'eggs',
  'large eggs': 'eggs',
  'egg yolk': 'eggs',
  'egg white': 'egg whites',
  'heavy cream': 'heavy whipping cream',
  'whipping cream': 'heavy whipping cream',
  'all purpose flour': 'all purpose flour',
  'all-purpose flour': 'all purpose flour',
  'flour': 'all purpose flour',
  'sugar': 'granulated sugar',
  'white sugar': 'granulated sugar',
  'powdered sugar': 'powdered sugar',
  'confectioners sugar': 'powdered sugar',
  'butter': 'butter',
  'unsalted butter': 'unsalted butter',
  'salted butter': 'butter',
  'olive oil': 'olive oil',
  'extra virgin olive oil': 'extra virgin olive oil',
  'vegetable oil': 'vegetable oil',
  'canola oil': 'canola oil',
  'soy sauce': 'soy sauce',
  'tomato': 'tomatoes',
  'roma tomato': 'roma tomatoes',
  'cherry tomato': 'cherry tomatoes',
  'potato': 'potatoes',
  'russet potato': 'russet potatoes',
  'sweet potato': 'sweet potatoes',
  'onion': 'yellow onion',
  'yellow onion': 'yellow onion',
  'red onion': 'red onion',
  'bell pepper': 'bell pepper',
  'green bell pepper': 'green bell pepper',
  'red bell pepper': 'red bell pepper',
  'jalapeno': 'jalapeno peppers',
  'lemon juice': 'lemon juice',
  'lime juice': 'lime juice',
  'lemon': 'lemons',
  'lime': 'limes',
  'banana': 'bananas',
  'apple': 'apples',
  'carrot': 'carrots',
  'celery stalk': 'celery',
  'celery stalks': 'celery',
  'rib celery': 'celery',
  'parmesan': 'parmesan cheese',
  'parmesan cheese': 'parmesan cheese',
  'cheddar': 'cheddar cheese',
  'shredded cheddar': 'shredded cheddar cheese',
  'mozzarella': 'mozzarella cheese',
  'rice': 'white rice',
  'pasta': 'pasta',
  'spaghetti': 'spaghetti',
  'bread': 'bread',
  'tortilla': 'tortillas',
  'black beans': 'black beans',
  'kidney beans': 'kidney beans',
  'chicken broth': 'chicken broth',
  'chicken stock': 'chicken broth',
  'beef broth': 'beef broth',
  'vegetable broth': 'vegetable broth',
  'milk': 'milk',
  'whole milk': 'whole milk',
  'sour cream': 'sour cream',
  'cream cheese': 'cream cheese',
  'yogurt': 'yogurt',
  'greek yogurt': 'greek yogurt',
  'peanut butter': 'peanut butter',
};

// Words that describe preparation or amount, never the product.
const PREP = new Set(`chopped minced diced sliced grated shredded crushed fresh freshly finely roughly thinly
large small medium whole halved quartered peeled seeded cubed melted softened room temperature to taste
optional divided packed cooked uncooked raw boneless skinless cut into pieces piece about plus more for
serving garnish beaten lightly ground dried dry frozen thawed rinsed drained can cans jar jars bunch bunches
handful pinch dash cup cups tablespoon tablespoons tbsp tsp teaspoon teaspoons oz ounce ounces pound pounds lb
lbs gram grams g kg ml liter liters quart pint stick sticks clove cloves sprig sprigs head heads package
packages pkg container bag of and or a an the`.split(/\s+/));

// These change which product you get, so a search keeps them.
const KEEP_WITH = new Set(['ground', 'dried', 'frozen', 'boneless', 'skinless', 'whole', 'shredded', 'grated', 'sliced', 'crushed', 'diced']);

export function cleanIngredient(text) {
  let t = fold(text)
    .replace(/\(.*?\)/g, ' ')
    .replace(/,.*$/, ' ') // "garlic, minced" -> "garlic"
    .replace(/[\d½¼¾⅓⅔⅛/.-]+/g, ' ')
    .replace(/[^a-z' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

function stripPrep(t, keepMeaningful) {
  return t.split(' ').filter((w) => w && (!PREP.has(w) || (keepMeaningful && KEEP_WITH.has(w)))).join(' ').trim();
}

// Ordered, de-duplicated list of queries to try for one ingredient.
export function queryVariants(text) {
  const cleaned = cleanIngredient(text);
  const out = [];
  const add = (q) => {
    const v = (q || '').trim();
    if (v.length >= 2 && !out.includes(v)) out.push(v);
  };
  // Lookup on the cleaned phrase first, then on the prep-free phrase.
  const soft = stripPrep(cleaned, true);
  const hard = stripPrep(cleaned, false);
  for (const phrase of [cleaned, soft, hard]) if (SHELF_NAMES[phrase]) add(SHELF_NAMES[phrase]);
  add(soft);
  add(hard);
  const words = hard.split(' ').filter(Boolean);
  if (words.length > 2) add(words.slice(-2).join(' '));
  if (words.length > 1) {
    const last = words[words.length - 1];
    if (SHELF_NAMES[last]) add(SHELF_NAMES[last]);
    add(last);
  }
  return out.slice(0, 4);
}

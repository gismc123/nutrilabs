// Everyday grocery searches priced on every nightly run. About 120 calls a night,
// far under the free tier's 10,000. Each returns up to 50 products, so the catalog
// covers several thousand items and their sale prices.
export const STAPLES = [
  // produce
  'bananas', 'apples', 'oranges', 'grapes', 'strawberries', 'blueberries', 'lemons', 'limes', 'avocados',
  'tomatoes', 'potatoes', 'sweet potatoes', 'yellow onion', 'garlic', 'carrots', 'celery', 'broccoli',
  'lettuce', 'spinach', 'salad mix', 'bell pepper', 'cucumber', 'mushrooms', 'zucchini', 'green beans', 'corn',
  'cabbage', 'cilantro', 'green onions', 'jalapeno peppers',
  // protein
  'ground beef', 'boneless skinless chicken breast', 'chicken thighs', 'whole chicken', 'pork chops',
  'pork tenderloin', 'bacon', 'breakfast sausage', 'italian sausage', 'ham', 'deli turkey', 'deli ham',
  'hot dogs', 'steak', 'beef roast', 'ground turkey', 'salmon', 'tilapia', 'shrimp', 'canned tuna',
  'eggs', 'tofu',
  // dairy
  'milk', 'butter', 'shredded cheese', 'cheddar cheese', 'sliced cheese', 'mozzarella cheese', 'cream cheese',
  'sour cream', 'yogurt', 'greek yogurt', 'cottage cheese', 'heavy whipping cream', 'coffee creamer', 'parmesan cheese',
  // pantry
  'bread', 'tortillas', 'hamburger buns', 'white rice', 'brown rice', 'pasta', 'spaghetti sauce', 'macaroni and cheese',
  'black beans', 'pinto beans', 'canned tomatoes', 'tomato sauce', 'chicken broth', 'canned soup', 'canned vegetables',
  'peanut butter', 'jelly', 'cereal', 'oatmeal', 'pancake mix', 'syrup', 'all purpose flour', 'granulated sugar',
  'vegetable oil', 'olive oil', 'mayonnaise', 'ketchup', 'mustard', 'salad dressing', 'salsa', 'tortilla chips',
  'potato chips', 'crackers', 'cookies', 'granola bars', 'coffee', 'tea', 'ramen noodles', 'spices',
  // frozen
  'frozen vegetables', 'frozen pizza', 'frozen chicken nuggets', 'frozen fries', 'ice cream', 'frozen meals',
  'frozen waffles', 'frozen fruit',
  // drinks
  'orange juice', 'apple juice', 'soda', 'sparkling water', 'bottled water', 'sports drink',
  // bakery
  'bagels', 'english muffins', 'dinner rolls', 'muffins', 'donuts',
];

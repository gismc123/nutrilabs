import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ── User ──────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('nutrilabs', 12);
  const user = await prisma.user.upsert({
    where: { email: 'admin@nutrilabs.local' },
    update: {},
    create: { email: 'admin@nutrilabs.local', passwordHash },
  });

  // ── Profiles ──────────────────────────────────────────────────────────────
  const profileDefs = [
    { name: 'Ivan',       isPlanner: true,  age: null, avatarColor: '#2E7D32', calorieTarget: 1800 },
    { name: 'Daughter 1', isPlanner: false, age: 6,    avatarColor: '#F57F17', calorieTarget: 1400 },
    { name: 'Daughter 2', isPlanner: false, age: 4,    avatarColor: '#AD1457', calorieTarget: 1200 },
  ];
  for (const p of profileDefs) {
    const existing = await prisma.profile.findFirst({ where: { userId: user.id, name: p.name } });
    if (!existing) {
      await prisma.profile.create({ data: { ...p, userId: user.id } });
    }
  }

  // ── AppSettings ───────────────────────────────────────────────────────────
  await prisma.appSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });

  // ── CustodyTemplate ───────────────────────────────────────────────────────
  const custodyDefs = [
    { dayOfWeek: 'MON', householdMode: 'SOLO' },
    { dayOfWeek: 'TUE', householdMode: 'SOLO' },
    { dayOfWeek: 'WED', householdMode: 'SOLO' },
    { dayOfWeek: 'THU', householdMode: 'SOLO' },
    { dayOfWeek: 'FRI', householdMode: 'SOLO' },
    { dayOfWeek: 'SAT', householdMode: 'DAD_MODE' },
    { dayOfWeek: 'SUN', householdMode: 'DAD_MODE' },
  ];
  for (const c of custodyDefs) {
    await prisma.custodyTemplate.upsert({
      where: { userId_dayOfWeek_isAlternatingWeek: { userId: user.id, dayOfWeek: c.dayOfWeek, isAlternatingWeek: false } },
      update: {},
      create: { userId: user.id, ...c, isAlternatingWeek: false },
    });
  }

  // ── PantryStaples ─────────────────────────────────────────────────────────
  const staples = [
    'olive oil', 'salt', 'black pepper', 'garlic powder', 'onion powder',
    'paprika', 'cumin', 'chili powder', 'Italian seasoning', 'soy sauce',
    'chicken broth', 'vegetable broth', 'cooking spray', 'sugar', 'flour',
    'baking powder', 'baking soda', 'vanilla extract', 'cinnamon',
  ];
  for (const name of staples) {
    await prisma.pantryStaple.upsert({
      where: { userId_name: { userId: user.id, name } },
      update: {},
      create: { userId: user.id, name },
    });
  }

  // ── Recipes ───────────────────────────────────────────────────────────────
  const recipes = [
    // ── Breakfasts ────────────────────────────────────────────────────────
    {
      name: 'Overnight Oats',
      mealType: 'BREAKFAST', source: 'USER', isKidFriendly: true,
      servings: 1, prepTimeMinutes: 5, costPerServing: 1.20,
      calories: 320, proteinG: 12, carbsG: 48, fatG: 8,
      tags: ['prep-friendly', 'budget', 'vegetarian'],
      ingredients: [
        { name: 'rolled oats', quantity: 0.5, unit: 'cup' },
        { name: 'milk', quantity: 1, unit: 'cup' },
        { name: 'chia seeds', quantity: 1, unit: 'tbsp' },
        { name: 'honey', quantity: 1, unit: 'tbsp' },
        { name: 'frozen mixed berries', quantity: 0.5, unit: 'cup' },
      ],
    },
    {
      name: 'Egg and Veggie Scramble',
      mealType: 'BREAKFAST', source: 'USER', isKidFriendly: true,
      servings: 1, prepTimeMinutes: 10, costPerServing: 1.40,
      calories: 280, proteinG: 18, carbsG: 10, fatG: 14,
      tags: ['high-protein', 'quick', 'low-carb'],
      ingredients: [
        { name: 'eggs', quantity: 3, unit: null },
        { name: 'bell pepper', quantity: 0.5, unit: null },
        { name: 'onion', quantity: 0.25, unit: null },
        { name: 'spinach', quantity: 1, unit: 'cup' },
        { name: 'olive oil', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Banana Peanut Butter Toast',
      mealType: 'BREAKFAST', source: 'USER', isKidFriendly: true,
      servings: 1, prepTimeMinutes: 5, costPerServing: 0.90,
      calories: 350, proteinG: 10, carbsG: 52, fatG: 11,
      tags: ['budget', 'quick', 'kids-love-it'],
      ingredients: [
        { name: 'whole wheat bread', quantity: 2, unit: 'slices' },
        { name: 'peanut butter', quantity: 2, unit: 'tbsp' },
        { name: 'banana', quantity: 1, unit: null },
        { name: 'honey', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Greek Yogurt Parfait',
      mealType: 'BREAKFAST', source: 'USER', isKidFriendly: true,
      servings: 1, prepTimeMinutes: 5, costPerServing: 1.60,
      calories: 290, proteinG: 20, carbsG: 34, fatG: 6,
      tags: ['high-protein', 'prep-friendly', 'no-cook'],
      ingredients: [
        { name: 'plain Greek yogurt', quantity: 1, unit: 'cup' },
        { name: 'granola', quantity: 0.25, unit: 'cup' },
        { name: 'mixed berries', quantity: 0.5, unit: 'cup' },
        { name: 'honey', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Avocado Toast with Eggs',
      mealType: 'BREAKFAST', source: 'USER', isKidFriendly: false,
      servings: 1, prepTimeMinutes: 10, costPerServing: 2.20,
      calories: 380, proteinG: 16, carbsG: 30, fatG: 22,
      tags: ['high-protein', 'healthy-fat'],
      ingredients: [
        { name: 'whole wheat bread', quantity: 2, unit: 'slices' },
        { name: 'avocado', quantity: 1, unit: null },
        { name: 'eggs', quantity: 2, unit: null },
        { name: 'red pepper flakes', quantity: 0.25, unit: 'tsp' },
        { name: 'lemon juice', quantity: 1, unit: 'tsp' },
      ],
    },
    // ── Lunches ───────────────────────────────────────────────────────────
    {
      name: 'Turkey and Veggie Wraps',
      mealType: 'LUNCH', source: 'USER', isKidFriendly: true,
      servings: 1, prepTimeMinutes: 10, costPerServing: 2.40,
      calories: 380, proteinG: 28, carbsG: 38, fatG: 10,
      tags: ['prep-friendly', 'budget', 'kids-love-it'],
      ingredients: [
        { name: 'whole wheat tortilla', quantity: 1, unit: null },
        { name: 'deli turkey', quantity: 3, unit: 'oz' },
        { name: 'romaine lettuce', quantity: 2, unit: 'leaves' },
        { name: 'tomato', quantity: 0.5, unit: null },
        { name: 'cucumber', quantity: 0.25, unit: null },
        { name: 'hummus', quantity: 2, unit: 'tbsp' },
      ],
    },
    {
      name: 'Chicken Rice Bowls',
      mealType: 'LUNCH', source: 'USER', isKidFriendly: true,
      servings: 4, prepTimeMinutes: 30, costPerServing: 2.80,
      calories: 450, proteinG: 38, carbsG: 46, fatG: 9,
      tags: ['prep-friendly', 'high-protein', 'batch-cook'],
      ingredients: [
        { name: 'chicken breast', quantity: 1.5, unit: 'lb' },
        { name: 'brown rice', quantity: 1, unit: 'cup dry' },
        { name: 'black beans', quantity: 1, unit: 'can' },
        { name: 'salsa', quantity: 0.5, unit: 'cup' },
        { name: 'lime', quantity: 1, unit: null },
        { name: 'cumin', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Red Lentil Soup',
      mealType: 'LUNCH', source: 'USER', isKidFriendly: true,
      servings: 6, prepTimeMinutes: 35, costPerServing: 1.10,
      calories: 310, proteinG: 18, carbsG: 52, fatG: 3,
      tags: ['budget', 'batch-cook', 'vegetarian', 'prep-friendly'],
      ingredients: [
        { name: 'red lentils', quantity: 1.5, unit: 'cup' },
        { name: 'diced tomatoes', quantity: 1, unit: 'can' },
        { name: 'onion', quantity: 1, unit: null },
        { name: 'garlic', quantity: 3, unit: 'cloves' },
        { name: 'cumin', quantity: 1.5, unit: 'tsp' },
        { name: 'turmeric', quantity: 0.5, unit: 'tsp' },
        { name: 'paprika', quantity: 1, unit: 'tsp' },
        { name: 'vegetable broth', quantity: 4, unit: 'cups' },
      ],
    },
    {
      name: 'Tuna Lettuce Wraps',
      mealType: 'LUNCH', source: 'USER', isKidFriendly: false,
      servings: 1, prepTimeMinutes: 5, costPerServing: 1.60,
      calories: 260, proteinG: 30, carbsG: 8, fatG: 9,
      tags: ['high-protein', 'no-cook', 'low-carb', 'quick'],
      ingredients: [
        { name: 'canned tuna in water', quantity: 1, unit: 'can' },
        { name: 'light mayo', quantity: 1, unit: 'tbsp' },
        { name: 'celery', quantity: 1, unit: 'stalk' },
        { name: 'red onion', quantity: 2, unit: 'tbsp' },
        { name: 'romaine lettuce', quantity: 4, unit: 'leaves' },
        { name: 'lemon juice', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Veggie Quesadillas',
      mealType: 'LUNCH', source: 'USER', isKidFriendly: true,
      servings: 2, prepTimeMinutes: 15, costPerServing: 1.80,
      calories: 370, proteinG: 14, carbsG: 48, fatG: 14,
      tags: ['budget', 'kids-love-it', 'vegetarian', 'quick'],
      ingredients: [
        { name: 'whole wheat tortillas', quantity: 2, unit: null },
        { name: 'shredded cheese', quantity: 1, unit: 'cup' },
        { name: 'bell pepper', quantity: 1, unit: null },
        { name: 'onion', quantity: 0.5, unit: null },
        { name: 'black beans', quantity: 0.5, unit: 'can' },
        { name: 'salsa', quantity: 0.25, unit: 'cup' },
      ],
    },
    // ── Dinners ───────────────────────────────────────────────────────────
    {
      name: 'Sheet Pan Chicken and Vegetables',
      mealType: 'DINNER', source: 'USER', isKidFriendly: true,
      servings: 4, prepTimeMinutes: 35, costPerServing: 3.20,
      calories: 420, proteinG: 40, carbsG: 28, fatG: 12,
      tags: ['prep-friendly', 'high-protein', 'kids-love-it', 'batch-cook'],
      ingredients: [
        { name: 'bone-in chicken thighs', quantity: 2, unit: 'lb' },
        { name: 'broccoli florets', quantity: 2, unit: 'cups' },
        { name: 'baby carrots', quantity: 1, unit: 'cup' },
        { name: 'olive oil', quantity: 2, unit: 'tbsp' },
        { name: 'garlic powder', quantity: 1, unit: 'tsp' },
        { name: 'paprika', quantity: 1, unit: 'tsp' },
      ],
    },
    {
      name: 'Black Bean Tacos',
      mealType: 'DINNER', source: 'USER', isKidFriendly: true,
      servings: 2, prepTimeMinutes: 15, costPerServing: 1.80,
      calories: 360, proteinG: 16, carbsG: 54, fatG: 8,
      tags: ['budget', 'vegetarian', 'kids-love-it', 'quick'],
      ingredients: [
        { name: 'black beans', quantity: 1, unit: 'can' },
        { name: 'corn tortillas', quantity: 6, unit: null },
        { name: 'shredded cabbage', quantity: 1, unit: 'cup' },
        { name: 'salsa', quantity: 0.5, unit: 'cup' },
        { name: 'sour cream', quantity: 2, unit: 'tbsp' },
        { name: 'lime', quantity: 1, unit: null },
        { name: 'cumin', quantity: 1, unit: 'tsp' },
        { name: 'chili powder', quantity: 0.5, unit: 'tsp' },
      ],
    },
    {
      name: 'Turkey Meatballs with Pasta',
      mealType: 'DINNER', source: 'USER', isKidFriendly: true,
      servings: 4, prepTimeMinutes: 40, costPerServing: 3.00,
      calories: 490, proteinG: 34, carbsG: 62, fatG: 12,
      tags: ['kids-love-it', 'batch-cook', 'prep-friendly'],
      ingredients: [
        { name: 'ground turkey', quantity: 1, unit: 'lb' },
        { name: 'whole wheat spaghetti', quantity: 12, unit: 'oz' },
        { name: 'marinara sauce', quantity: 1, unit: 'jar' },
        { name: 'egg', quantity: 1, unit: null },
        { name: 'breadcrumbs', quantity: 0.25, unit: 'cup' },
        { name: 'garlic', quantity: 2, unit: 'cloves' },
        { name: 'Italian seasoning', quantity: 1, unit: 'tsp' },
        { name: 'parmesan', quantity: 2, unit: 'tbsp' },
      ],
    },
    {
      name: 'Egg Fried Rice',
      mealType: 'DINNER', source: 'USER', isKidFriendly: true,
      servings: 2, prepTimeMinutes: 15, costPerServing: 1.40,
      calories: 390, proteinG: 16, carbsG: 58, fatG: 10,
      tags: ['budget', 'kids-love-it', 'quick', 'use-leftovers'],
      ingredients: [
        { name: 'cooked rice (day-old)', quantity: 2, unit: 'cups' },
        { name: 'eggs', quantity: 3, unit: null },
        { name: 'frozen peas and carrots', quantity: 1, unit: 'cup' },
        { name: 'soy sauce', quantity: 2, unit: 'tbsp' },
        { name: 'sesame oil', quantity: 1, unit: 'tsp' },
        { name: 'green onion', quantity: 2, unit: 'stalks' },
      ],
    },
    {
      name: 'Slow Cooker Chicken Chili',
      mealType: 'DINNER', source: 'USER', isKidFriendly: true,
      servings: 6, prepTimeMinutes: 20, costPerServing: 2.80,
      calories: 340, proteinG: 32, carbsG: 40, fatG: 6,
      tags: ['batch-cook', 'prep-friendly', 'budget', 'kids-love-it'],
      ingredients: [
        { name: 'chicken breast', quantity: 1.5, unit: 'lb' },
        { name: 'white beans', quantity: 2, unit: 'cans' },
        { name: 'corn', quantity: 1, unit: 'can' },
        { name: 'green chiles', quantity: 1, unit: 'can' },
        { name: 'chicken broth', quantity: 2, unit: 'cups' },
        { name: 'garlic powder', quantity: 1, unit: 'tsp' },
        { name: 'cumin', quantity: 1.5, unit: 'tsp' },
      ],
    },
  ];

  for (const { ingredients, ...recipeData } of recipes) {
    const existing = await prisma.recipe.findFirst({ where: { name: recipeData.name } });
    if (!existing) {
      await prisma.recipe.create({
        data: {
          ...recipeData,
          costPerServing: recipeData.costPerServing,
          ingredients: { create: ingredients },
        },
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

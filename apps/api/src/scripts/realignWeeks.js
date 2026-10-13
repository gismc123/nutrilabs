// One-off: move meal plans that don't start on each user's configured week
// start day onto aligned weeks. Usage: node src/scripts/realignWeeks.js [userId]
import prisma from '../lib/prisma.js';
import { realignMealPlans } from '../lib/weekPlans.js';

const onlyUserId = process.argv[2] ? parseInt(process.argv[2]) : null;

const settings = await prisma.appSettings.findMany({
  where: onlyUserId ? { userId: onlyUserId } : {},
  select: { userId: true, weekStartDay: true },
});

for (const { userId, weekStartDay } of settings) {
  const summary = await realignMealPlans(userId, weekStartDay);
  console.log(JSON.stringify({ userId, weekStartDay, ...summary }));
}

await prisma.$disconnect();

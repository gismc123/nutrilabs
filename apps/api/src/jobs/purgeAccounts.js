import cron from 'node-cron';
import prisma from '../lib/prisma.js';

async function purgeExpiredAccounts() {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { isActive: false, scheduledPurgeAt: { lte: now } },
    select: { id: true, email: true },
  });

  for (const user of users) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.pantryInventoryItem.deleteMany({ where: { userId: user.id } });
        await tx.pantryStaple.deleteMany({ where: { userId: user.id } });
        await tx.custodyTemplate.deleteMany({ where: { userId: user.id } });
        await tx.eatingOutLog.deleteMany({ where: { userId: user.id } });

        const mealPlans = await tx.mealPlan.findMany({ where: { userId: user.id }, select: { id: true } });
        for (const mp of mealPlans) {
          const groceryLists = await tx.groceryList.findMany({ where: { mealPlanId: mp.id }, select: { id: true } });
          for (const gl of groceryLists) {
            await tx.groceryItem.deleteMany({ where: { groceryListId: gl.id } });
          }
          await tx.groceryList.deleteMany({ where: { mealPlanId: mp.id } });
          await tx.plannedMeal.deleteMany({ where: { mealPlanId: mp.id } });
          await tx.dayConfig.deleteMany({ where: { mealPlanId: mp.id } });
        }
        await tx.mealPlan.deleteMany({ where: { userId: user.id } });
        await tx.profile.deleteMany({ where: { userId: user.id } });
        await tx.appSettings.deleteMany({ where: { userId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
      });
      console.log(`[purge] Hard-deleted account id=${user.id} email=${user.email}`);
    } catch (err) {
      console.error(`[purge] Failed to purge user id=${user.id}:`, err.message);
    }
  }
}

export function startPurgeJob() {
  cron.schedule('0 2 * * *', () => {
    console.log('[purge] Running scheduled account purge');
    purgeExpiredAccounts().catch((err) => console.error('[purge] Error:', err.message));
  });
}

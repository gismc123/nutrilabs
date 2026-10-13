import prisma from './prisma.js';

/** Prisma filter for recipes a user may see: the shared library plus their own. */
export function visibleRecipes(user) {
  return { OR: [{ userId: null }, { userId: user.userId }] };
}

/** Own recipes are editable; shared library recipes only by admins. */
export function canEditRecipe(user, recipe) {
  return recipe.userId === user.userId || (recipe.userId == null && !!user.isAdmin);
}

/** True when every id (nulls ignored) is a recipe the user can see. */
export async function recipesVisible(user, ids) {
  const wanted = [...new Set(ids.filter((id) => id != null))];
  if (!wanted.length) return true;
  const count = await prisma.recipe.count({ where: { id: { in: wanted }, ...visibleRecipes(user) } });
  return count === wanted.length;
}

export function forbidden(res, message = 'You do not have permission to do that') {
  return res.status(403).json({ data: null, error: { message, code: 'FORBIDDEN' } });
}

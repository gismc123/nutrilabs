import RecipeCard from './RecipeCard.jsx';
import EmptyState from '../ui/EmptyState.jsx';

export default function RecipeGrid({ recipes, onSelect }) {
  if (!recipes.length) {
    return (
      <EmptyState
        icon="book"
        title="No recipes found"
        message="Try adjusting your search or filters."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {recipes.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} onClick={onSelect} />
      ))}
    </div>
  );
}

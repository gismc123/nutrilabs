import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconSparkles, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { aiSuggestRecipes, createRecipe } from '../../api/client.js';
import { useHealth } from '../../hooks/useHealth.js';
import Badge from '../ui/Badge.jsx';
import { SkeletonCard } from '../ui/Skeleton.jsx';

const CONTEXT_CHIPS = ['Tonight', 'This week', 'Kid-friendly', 'Budget', 'High protein', 'Under 15 min'];

export default function AISuggestPanel() {
  const { health } = useHealth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: (suggestion) =>
      createRecipe({
        name: suggestion.name,
        description: suggestion.description ?? null,
        mealType: suggestion.mealType ?? 'DINNER',
        servings: 1,
        prepTimeMinutes: suggestion.prepTimeMinutes ?? null,
        calories: suggestion.estimatedCalories ?? null,
        proteinG: suggestion.estimatedProteinG ?? null,
        carbsG: suggestion.estimatedCarbsG ?? null,
        fatG: suggestion.estimatedFatG ?? null,
        costPerServing: suggestion.estimatedCostPerServing ?? null,
        isKidFriendly: suggestion.isKidFriendly ?? true,
        tags: [],
        ingredients: [],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      toast.success('Recipe saved to library');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleChip = (chip) => {
    setPrompt((p) => p ? `${p}, ${chip.toLowerCase()}` : chip.toLowerCase());
  };

  const handleSuggest = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSuggestions(null);
    try {
      const result = await aiSuggestRecipes(prompt);
      setSuggestions(result);
    } catch (err) {
      toast.error(err.message ?? 'AI suggestion failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-neutral-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <IconSparkles size={16} className="text-primary-600" />
          Suggest recipes with AI
        </span>
        {expanded ? <IconChevronUp size={16} className="text-neutral-400" /> : <IconChevronDown size={16} className="text-neutral-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-neutral-50">
          {!health?.ollamaConnected ? (
            <p className="text-sm text-neutral-500 py-3">
              AI suggestions unavailable — check Ollama connection in Settings
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 pt-3">
                {CONTEXT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChip(chip)}
                    className="px-2.5 py-1 rounded-full text-xs border border-neutral-200 text-neutral-600 hover:bg-neutral-50 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. high protein dinners under $3"
                  onKeyDown={(e) => e.key === 'Enter' && handleSuggest()}
                  className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
                <button
                  onClick={handleSuggest}
                  disabled={loading || !prompt.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  Suggest
                </button>
              </div>

              {loading && (
                <div className="space-y-3">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              )}

              {suggestions && (
                <div className="space-y-3">
                  {suggestions.map((s, i) => (
                    <div key={i} className="border border-neutral-100 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-semibold text-neutral-900">{s.name}</p>
                      {s.description && <p className="text-xs text-neutral-500">{s.description}</p>}
                      <div className="flex gap-1.5 flex-wrap">
                        {s.estimatedCalories && (
                          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">{s.estimatedCalories} cal</span>
                        )}
                        {s.estimatedProteinG && (
                          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">P {s.estimatedProteinG}g</span>
                        )}
                        {s.estimatedCostPerServing && (
                          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">${s.estimatedCostPerServing}/srv</span>
                        )}
                        {s.prepTimeMinutes && (
                          <span className="text-xs bg-neutral-100 px-2 py-0.5 rounded-full text-neutral-600">{s.prepTimeMinutes} min</span>
                        )}
                      </div>
                      <button
                        onClick={() => saveMutation.mutate(s)}
                        disabled={saveMutation.isPending}
                        className="w-full py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
                      >
                        Save to library
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

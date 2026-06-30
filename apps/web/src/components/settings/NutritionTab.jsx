import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateSettings } from '../../api/client.js';
import { useSettings } from '../../hooks/useSettings.js';

function clampMacros(protein, carbs, fat) {
  const total = protein + carbs + fat;
  if (total === 0) return { protein: 25, carbs: 50, fat: 25 };
  return {
    protein: Math.round((protein / total) * 100),
    carbs: Math.round((carbs / total) * 100),
    fat: 100 - Math.round((protein / total) * 100) - Math.round((carbs / total) * 100),
  };
}

export default function NutritionTab() {
  const { settings } = useSettings();
  const [calorieTarget, setCalorieTarget] = useState('');
  const [weeklyBudget, setWeeklyBudget] = useState('');
  const [eatingOutRef, setEatingOutRef] = useState('');
  const [protein, setProtein] = useState(25);
  const [carbs, setCarbs] = useState(50);
  const [fat, setFat] = useState(25);

  useEffect(() => {
    if (!settings) return;
    setCalorieTarget(settings.calorieGoal ?? '');
    setWeeklyBudget(settings.weeklyBudget != null ? (settings.weeklyBudget / 100).toFixed(2) : '');
    setEatingOutRef(settings.eatingOutReference != null ? (settings.eatingOutReference / 100).toFixed(2) : '');
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (data) => updateSettings(data),
    onSuccess: () => toast.success('Nutrition settings saved'),
    onError: (err) => toast.error(err.message),
  });

  const handleMacroChange = (field, rawValue) => {
    const val = Math.min(100, Math.max(0, parseInt(rawValue) || 0));
    if (field === 'protein') {
      const remaining = 100 - val;
      const oldOther = carbs + fat;
      const newCarbs = oldOther > 0 ? Math.round(remaining * (carbs / oldOther)) : Math.round(remaining / 2);
      const newFat = remaining - newCarbs;
      setProtein(val); setCarbs(newCarbs); setFat(newFat);
    } else if (field === 'carbs') {
      const remaining = 100 - val;
      const oldOther = protein + fat;
      const newProtein = oldOther > 0 ? Math.round(remaining * (protein / oldOther)) : Math.round(remaining / 2);
      const newFat = remaining - newProtein;
      setCarbs(val); setProtein(newProtein); setFat(newFat);
    } else {
      const remaining = 100 - val;
      const oldOther = protein + carbs;
      const newProtein = oldOther > 0 ? Math.round(remaining * (protein / oldOther)) : Math.round(remaining / 2);
      const newCarbs = remaining - newProtein;
      setFat(val); setProtein(newProtein); setCarbs(newCarbs);
    }
  };

  const handleSave = () => {
    mutation.mutate({
      weeklyBudget: weeklyBudget ? Math.round(parseFloat(weeklyBudget) * 100) : undefined,
      eatingOutReference: eatingOutRef ? Math.round(parseFloat(eatingOutRef) * 100) : undefined,
    });
  };

  const MacroSlider = ({ label, value, onChange, color }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-neutral-700">{label}</label>
        <span className={`text-sm font-semibold ${color}`}>{value}%</span>
      </div>
      <input type="range" min="0" max="100" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full accent-primary-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Your daily calorie goal</label>
        <input type="number" value={calorieTarget} onChange={(e) => setCalorieTarget(e.target.value)} min="0" placeholder="e.g. 1800"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-700">Macro split</h3>
        <MacroSlider label="Protein" value={protein} onChange={(v) => handleMacroChange('protein', v)} color="text-primary-600" />
        <MacroSlider label="Carbohydrates" value={carbs} onChange={(v) => handleMacroChange('carbs', v)} color="text-accent-600" />
        <MacroSlider label="Fat" value={fat} onChange={(v) => handleMacroChange('fat', v)} color="text-neutral-600" />
        <p className="text-xs text-neutral-400">Total: {protein + carbs + fat}%</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Weekly grocery budget</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input type="number" value={weeklyBudget} onChange={(e) => setWeeklyBudget(e.target.value)} min="0" step="0.01" placeholder="120.00"
            className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Estimated cost per meal eating out</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
          <input type="number" value={eatingOutRef} onChange={(e) => setEatingOutRef(e.target.value)} min="0" step="0.01" placeholder="12.00"
            className="w-full pl-7 pr-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <p className="text-xs text-neutral-400 mt-1">Used for savings calculations — the estimated cost of one meal if eaten out instead of cooked at home.</p>
      </div>

      <button onClick={handleSave} disabled={mutation.isPending}
        className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
        {mutation.isPending ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

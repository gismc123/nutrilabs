import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getCustodyTemplate, updateCustodyTemplate } from '../../api/client.js';

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_LABELS = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };

function buildDefault(byDay, isAlt) {
  const result = {};
  for (const day of DAYS) {
    const existing = byDay[day] && byDay[day].isAlternatingWeek === isAlt ? byDay[day] : null;
    result[day] = existing?.householdMode ?? 'SOLO';
  }
  return result;
}

export default function CustodyTab() {
  const queryClient = useQueryClient();
  const { data: byDay } = useQuery({ queryKey: ['custody-template'], queryFn: getCustodyTemplate, staleTime: 60_000 });
  const [alternating, setAlternating] = useState(false);
  const [primary, setPrimary] = useState({});
  const [alt, setAlt] = useState({});

  useEffect(() => {
    if (!byDay) return;
    const hasAlt = Object.values(byDay).some((d) => d.isAlternatingWeek);
    setAlternating(hasAlt);
    setPrimary(buildDefault(byDay, false));
    setAlt(buildDefault(byDay, true));
  }, [byDay]);

  const mutation = useMutation({
    mutationFn: (rows) => updateCustodyTemplate(rows),
    onSuccess: () => {
      toast.success('Custody template saved');
      queryClient.invalidateQueries({ queryKey: ['custody-template'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    const rows = DAYS.map((day) => ({
      dayOfWeek: day,
      householdMode: primary[day] ?? 'SOLO',
      isAlternatingWeek: false,
    }));
    if (alternating) {
      for (const day of DAYS) {
        rows.push({ dayOfWeek: day, householdMode: alt[day] ?? 'SOLO', isAlternatingWeek: true });
      }
    }
    mutation.mutate(rows);
  };

  const ModeToggle = ({ mode, onChange }) => (
    <div className="flex gap-1">
      {['SOLO', 'DAD_MODE'].map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${mode === m ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50'}`}>
          {m === 'SOLO' ? 'Solo' : 'Dad'}
        </button>
      ))}
    </div>
  );

  const DayRow = ({ day, value, onChange }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-neutral-100 last:border-0">
      <span className="text-sm text-neutral-700 w-28">{DAY_LABELS[day]}</span>
      <ModeToggle mode={value} onChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input type="checkbox" id="alternating" checked={alternating} onChange={(e) => setAlternating(e.target.checked)}
          className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-600" />
        <label htmlFor="alternating" className="text-sm font-medium text-neutral-700">I have alternating weeks</label>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
          {alternating ? 'Regular week' : 'Weekly schedule'}
        </h3>
        <div className="bg-white rounded-xl border border-neutral-100 px-4">
          {DAYS.map((day) => (
            <DayRow key={day} day={day} value={primary[day] ?? 'SOLO'}
              onChange={(v) => setPrimary((prev) => ({ ...prev, [day]: v }))} />
          ))}
        </div>
      </div>

      {alternating && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">Alternate week</h3>
          <div className="bg-white rounded-xl border border-neutral-100 px-4">
            {DAYS.map((day) => (
              <DayRow key={day} day={day} value={alt[day] ?? 'SOLO'}
                onChange={(v) => setAlt((prev) => ({ ...prev, [day]: v }))} />
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={mutation.isPending}
        className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
        {mutation.isPending ? 'Saving...' : 'Save as my default'}
      </button>
    </div>
  );
}

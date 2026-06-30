import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateSettings, changePassword } from '../../api/client.js';
import { useSettings } from '../../hooks/useSettings.js';

const WEEK_DAYS = [
  { value: 'SUN', label: 'Sunday' },
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
];

const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD'];

export default function PreferencesTab() {
  const { settings } = useSettings();
  const [weekStartDay, setWeekStartDay] = useState('SUN');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [currency, setCurrency] = useState('USD');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!settings) return;
    setWeekStartDay(settings.weekStartDay ?? 'SUN');
    setDateFormat(settings.dateFormat ?? 'MM/DD/YYYY');
    setCurrency(settings.currency ?? 'USD');
  }, [settings]);

  const prefsMutation = useMutation({
    mutationFn: (data) => updateSettings(data),
    onSuccess: () => toast.success('Preferences saved'),
    onError: (err) => toast.error(err.message),
  });

  const pwMutation = useMutation({
    mutationFn: (data) => changePassword(data),
    onSuccess: () => {
      toast.success('Password updated');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    },
    onError: (err) => toast.error(err.message),
  });

  const handlePreferencesSave = () => {
    prefsMutation.mutate({ weekStartDay, dateFormat, currency });
  };

  const handlePasswordSave = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    pwMutation.mutate({ currentPassword, newPassword });
  };

  const inputClass = 'w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600';

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Display preferences</h3>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Week starts on</label>
          <select value={weekStartDay} onChange={(e) => setWeekStartDay(e.target.value)} className={inputClass}>
            {WEEK_DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Date format</label>
          <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={inputClass}>
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Currency</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={handlePreferencesSave} disabled={prefsMutation.isPending}
          className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {prefsMutation.isPending ? 'Saving...' : 'Save preferences'}
        </button>
      </div>

      <div className="border-t border-neutral-100 pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-neutral-900">Change password</h3>
        <form onSubmit={handlePasswordSave} className="space-y-3">
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password" required className={inputClass} />
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password (min. 8 characters)" required className={inputClass} />
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password" required className={inputClass} />
          <button type="submit" disabled={pwMutation.isPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-neutral-800 rounded-lg hover:bg-neutral-900 disabled:opacity-50 transition-colors">
            {pwMutation.isPending ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}

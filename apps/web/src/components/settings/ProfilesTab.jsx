import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { createProfile, updateProfile, deleteProfile, deactivateAccount, logout } from '../../api/client.js';
import { useProfiles } from '../../hooks/useProfiles.js';
import BottomSheet from '../ui/BottomSheet.jsx';
import { useUiStore } from '../../store/uiStore.js';

const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];

function initials(name) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function ProfileForm({ profile, onClose }) {
  const queryClient = useQueryClient();
  const isEdit = !!profile;
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(profile?.age ?? '');
  const [color, setColor] = useState(profile?.avatarColor ?? AVATAR_COLORS[0]);
  const [dietaryNotes, setDietaryNotes] = useState(profile?.dietaryNotes ?? '');
  const [foodDislikes, setFoodDislikes] = useState(profile?.foodDislikes ?? '');
  const [calorieTarget, setCalorieTarget] = useState(profile?.calorieTarget ?? '');

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? updateProfile(profile.id, data) : createProfile(data),
    onSuccess: () => {
      toast.success(isEdit ? 'Profile updated' : 'Profile added');
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onClose();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate({
      name,
      age: age ? parseInt(age) : undefined,
      avatarColor: color,
      dietaryNotes: dietaryNotes || undefined,
      foodDislikes: foodDislikes || undefined,
      calorieTarget: calorieTarget ? parseInt(calorieTarget) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Age (optional)</label>
        <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min="0" max="120"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-2">Avatar color</label>
        <div className="flex gap-2">
          {AVATAR_COLORS.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-neutral-400 scale-110' : ''}`} />
          ))}
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Dietary notes</label>
        <textarea value={dietaryNotes} onChange={(e) => setDietaryNotes(e.target.value)} rows={2}
          placeholder="e.g. vegetarian, no nuts..."
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Food dislikes</label>
        <textarea value={foodDislikes} onChange={(e) => setFoodDislikes(e.target.value)} rows={2}
          placeholder="e.g. mushrooms, olives..."
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600 resize-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">Daily calorie target</label>
        <input type="number" value={calorieTarget} onChange={(e) => setCalorieTarget(e.target.value)} min="0" placeholder="e.g. 1800"
          className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
      </div>
      <button type="submit" disabled={mutation.isPending || !name}
        className="w-full py-2.5 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
        {mutation.isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Add profile'}
      </button>
    </form>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [phrase, setPhrase] = useState('');

  const mutation = useMutation({
    mutationFn: () => deactivateAccount({ password, confirmPhrase: phrase }),
    onSuccess: async () => {
      toast.success('Account deactivated. You have 30 days to reactivate.');
      await logout();
      navigate('/login');
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <>
      <div className="mt-8 pt-6 border-t border-neutral-100">
        <h3 className="text-sm font-semibold text-neutral-900 mb-1">Danger zone</h3>
        <p className="text-xs text-neutral-400 mb-3">Deactivating your account hides your data for 30 days, then permanently deletes it.</p>
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 text-sm font-medium text-danger-600 border border-danger-200 rounded-lg hover:bg-danger-50 transition-colors"
        >
          Deactivate account
        </button>
      </div>

      <BottomSheet isOpen={open} onClose={() => setOpen(false)} title="Deactivate account">
        <div className="space-y-4">
          <div className="bg-danger-50 border border-danger-200 rounded-xl p-3">
            <p className="text-sm text-danger-700 font-medium">This will deactivate your account.</p>
            <p className="text-xs text-danger-600 mt-1">
              All your data is preserved for 30 days, then permanently deleted.
              You can reactivate by clicking the link in the deactivation confirmation email.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm your password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Type <span className="font-mono font-semibold">delete my account</span> to confirm
            </label>
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="delete my account"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
          </div>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !password || phrase !== 'delete my account'}
            className="w-full py-3 text-sm font-semibold text-white bg-danger-600 rounded-lg hover:bg-danger-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? 'Deactivating…' : 'Deactivate my account'}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

export default function ProfilesTab() {
  const { profiles } = useProfiles();
  const queryClient = useQueryClient();
  const showConfirm = useUiStore((s) => s.showConfirm);
  const [formProfile, setFormProfile] = useState(null);
  const [formOpen, setFormOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProfile(id),
    onSuccess: () => {
      toast.success('Profile deleted');
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (p) => {
    showConfirm('Delete profile', `Delete "${p.name}"? This cannot be undone.`, () => deleteMutation.mutate(p.id));
  };

  const openAdd = () => { setFormProfile(null); setFormOpen(true); };
  const openEdit = (p) => { setFormProfile(p); setFormOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Household profiles</h2>
        <button onClick={openAdd}
          className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors">
          Add profile
        </button>
      </div>

      <div className="space-y-3">
        {(profiles ?? []).map((p) => (
          <div key={p.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-100">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
              style={{ backgroundColor: p.avatarColor }}
            >
              {initials(p.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-900">{p.name}</span>
                {p.isPlanner && (
                  <span className="text-[10px] font-semibold bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full">You</span>
                )}
                {p.age && <span className="text-xs text-neutral-400">age {p.age}</span>}
              </div>
              {p.dietaryNotes && (
                <p className="text-xs text-neutral-400 truncate mt-0.5">{p.dietaryNotes}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => openEdit(p)} className="p-1.5 text-neutral-400 hover:text-primary-600 rounded-lg hover:bg-neutral-50">
                <IconEdit size={16} />
              </button>
              {!p.isPlanner && (
                <button onClick={() => handleDelete(p)} className="p-1.5 text-neutral-400 hover:text-danger-600 rounded-lg hover:bg-neutral-50">
                  <IconTrash size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <BottomSheet isOpen={formOpen} onClose={() => setFormOpen(false)} title={formProfile ? 'Edit profile' : 'Add profile'}>
        <ProfileForm profile={formProfile} onClose={() => setFormOpen(false)} />
      </BottomSheet>

      <DangerZone />
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPassword } from '../../api/client.js';

function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function PasswordStrengthBar({ password }) {
  if (!password) return null;
  const score = passwordStrength(password);
  const levels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-primary-400', 'bg-primary-600'];
  return (
    <div className="mt-1.5">
      <div className="flex gap-1 h-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`flex-1 rounded-full ${i <= score ? colors[score - 1] : 'bg-neutral-200'}`} />
        ))}
      </div>
      <p className="text-xs text-neutral-400 mt-1">{levels[score - 1] || ''}</p>
    </div>
  );
}

export default function ResetPasswordForm({ token }) {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }

    setSubmitting(true);
    setError(null);
    try {
      await resetPassword({ token, newPassword, confirmPassword: confirm });
      setSuccess(true);
    } catch (err) {
      const code = err.message;
      if (code?.includes('TOKEN_EXPIRED') || code?.includes('expired')) {
        setError('This reset link has expired.');
      } else if (code?.includes('TOKEN_INVALID') || code?.includes('invalid')) {
        setError('This reset link is invalid or has already been used.');
      } else {
        setError(err.message || 'Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-neutral-700 font-medium">Password updated.</p>
        <p className="text-sm text-neutral-500">You can now sign in with your new password.</p>
        <Link to="/login" className="inline-block text-sm font-medium text-white bg-primary-600 px-6 py-2.5 rounded-lg hover:bg-primary-700">
          Sign in
        </Link>
      </div>
    );
  }

  if (error && (error.includes('expired') || error.includes('invalid') || error.includes('already been used'))) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-danger-700">{error}</p>
        <Link to="/forgot-password" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral-900 mb-1">Set a new password</h2>
      <p className="text-sm text-neutral-500 mb-6">Choose a strong password for your NutriLabs account.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">New password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
          <PasswordStrengthBar password={newPassword} />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm new password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Updating…' : 'Set new password'}
        </button>
      </form>
    </div>
  );
}

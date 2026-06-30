import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../../api/client.js';

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto">
          <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-neutral-700">
          If an account exists with that email, a reset link has been sent. Check your inbox.
        </p>
        <Link to="/login" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral-900 mb-1">Forgot your password?</h2>
      <p className="text-sm text-neutral-500 mb-6">Enter your account email and we'll send you a reset link.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Enter your account email
          </label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
          />
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link to="/login" className="text-sm text-neutral-500 hover:text-neutral-700">
          Back to login
        </Link>
      </div>
    </div>
  );
}

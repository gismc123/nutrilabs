import { useEffect } from 'react';
import ForgotPasswordForm from '../components/auth/ForgotPasswordForm.jsx';

export default function ForgotPassword() {
  useEffect(() => { document.title = 'NutriLabs — Forgot password'; }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-neutral-200 p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.svg" alt="NutriLabs" className="w-10 h-10 rounded-xl shadow-sm" />
          <h1 className="text-2xl font-bold text-primary-600 tracking-tight">NutriLabs</h1>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  );
}

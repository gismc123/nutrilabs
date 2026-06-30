import { useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import ResetPasswordForm from '../components/auth/ResetPasswordForm.jsx';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => { document.title = 'NutriLabs — Reset password'; }, []);

  if (!token) {
    return <Navigate to="/forgot-password" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-neutral-200 p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/logo.svg" alt="NutriLabs" className="w-10 h-10 rounded-xl shadow-sm" />
          <h1 className="text-2xl font-bold text-primary-600 tracking-tight">NutriLabs</h1>
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}

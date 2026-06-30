import { useEffect } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth.js';
import RegisterForm from '../components/auth/RegisterForm.jsx';

export default function Register() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => { document.title = 'NutriLabs — Create account'; }, []);

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="NutriLabs" className="w-16 h-16 rounded-2xl shadow-sm mx-auto mb-3" />
          <h1 className="text-3xl font-extrabold text-primary-600">NutriLabs</h1>
          <p className="text-sm text-neutral-400 mt-1">Your self-hosted meal planner</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 md:p-8">
          <RegisterForm onComplete={() => navigate('/', { replace: true })} />
        </div>

        <p className="text-center text-sm text-neutral-500 mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
            Sign in
          </Link>
        </p>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 text-xs text-neutral-400">
        <Link to="/privacy" className="hover:text-neutral-600">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-neutral-600">Terms of Use</Link>
      </footer>
    </div>
  );
}

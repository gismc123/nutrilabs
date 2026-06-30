import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { register, createProfile, updateSettings, testOllamaConnection } from '../../api/client.js';

const TOTAL_STEPS = 3;

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
            i + 1 < step ? 'bg-primary-600 text-white'
              : i + 1 === step ? 'bg-primary-600 text-white ring-4 ring-primary-100'
              : 'bg-neutral-200 text-neutral-400'
          }`}>{i + 1 < step ? '✓' : i + 1}</div>
          {i < TOTAL_STEPS - 1 && (
            <div className={`h-0.5 w-8 ${i + 1 < step ? 'bg-primary-600' : 'bg-neutral-200'}`} />
          )}
        </div>
      ))}
      <span className="ml-2 text-xs text-neutral-400">Step {step} of {TOTAL_STEPS}</span>
    </div>
  );
}

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
  const colors = ['bg-danger-500', 'bg-warning-500', 'bg-yellow-400', 'bg-primary-400', 'bg-primary-600'];
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

function Step1Account({ onNext }) {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => register(data),
    onSuccess: (data) => onNext(data),
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    mutation.mutate({ email, password, confirmPassword: confirm, displayName });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Create your account</h2>
      <p className="text-sm text-neutral-500 mb-6">Set up your NutriLabs account.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Your name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={50} autoFocus
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          <PasswordStrengthBar password={password} />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <button type="submit" disabled={mutation.isPending}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  );
}

function Step2Household({ userData, onNext }) {
  const [children, setChildren] = useState([{ name: '', age: '' }]);

  const mutation = useMutation({
    mutationFn: (profiles) => Promise.all(profiles.map((p) => createProfile(p))),
    onSuccess: () => onNext(),
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    const filled = children.filter((c) => c.name.trim());
    if (filled.length === 0) { onNext(); return; }
    const profiles = filled.map((c) => ({
      name: c.name.trim(),
      age: c.age ? parseInt(c.age) : undefined,
      avatarColor: '#3b82f6',
      isPlanner: false,
    }));
    mutation.mutate(profiles);
  };

  const displayName = userData?.user?.displayName || userData?.user?.email?.split('@')[0] || 'You';

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Your household</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Add children so NutriLabs can plan kid-friendly meals on the right days.
      </p>

      <div className="bg-primary-50 rounded-xl p-3 flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">
          {displayName.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-900">{displayName}</p>
          <p className="text-xs text-neutral-500">Planner · You</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {children.map((child, i) => (
          <div key={i} className="flex gap-2">
            <input type="text" value={child.name}
              onChange={(e) => setChildren(children.map((c, idx) => idx === i ? { ...c, name: e.target.value } : c))}
              placeholder="Child's name"
              className="flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
            <input type="number" value={child.age}
              onChange={(e) => setChildren(children.map((c, idx) => idx === i ? { ...c, age: e.target.value } : c))}
              placeholder="Age" min="0" max="18"
              className="w-20 px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
            {children.length > 1 && (
              <button onClick={() => setChildren(children.filter((_, idx) => idx !== i))} className="px-2 text-neutral-400 hover:text-danger-500">×</button>
            )}
          </div>
        ))}
      </div>

      <button onClick={() => setChildren([...children, { name: '', age: '' }])} className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-6">
        + Add another child
      </button>

      <div className="flex gap-3">
        <button onClick={handleSubmit} disabled={mutation.isPending}
          className="flex-1 py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? 'Saving…' : 'Continue'}
        </button>
        <button onClick={onNext} className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">Skip</button>
      </div>
    </div>
  );
}

function Step3Ollama({ onFinish }) {
  const [host, setHost] = useState('http://192.168.1.190:11434');
  const [testResult, setTestResult] = useState(null);

  const testMutation = useMutation({
    mutationFn: testOllamaConnection,
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ connected: false, message: err.message }),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => updateSettings(data),
    onSuccess: () => onFinish(),
    onError: (err) => toast.error(err.message),
  });

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Connect to Ollama</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Optional — enables AI meal suggestions and spending insights on your local network.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Ollama host URL</label>
          <input type="url" value={host} onChange={(e) => setHost(e.target.value)}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors">
          {testMutation.isPending ? 'Testing…' : 'Test connection'}
        </button>
        {testResult && (
          <p className={`text-sm ${testResult.connected ? 'text-primary-600' : 'text-neutral-500'}`}>
            {testResult.connected ? `✓ ${testResult.message || 'Connected'}` : `Couldn't connect — ${testResult.message}`}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={() => saveMutation.mutate({ ollamaHost: host })} disabled={saveMutation.isPending}
            className="flex-1 py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saveMutation.isPending ? 'Saving…' : 'Finish'}
          </button>
          <button onClick={onFinish} className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RegisterForm({ onComplete }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [userData, setUserData] = useState(null);

  const handleStep1Done = (data) => {
    setUserData(data);
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    setStep(2);
  };

  const handleFinish = () => {
    onComplete?.();
  };

  const steps = [
    <Step1Account key={1} onNext={handleStep1Done} />,
    <Step2Household key={2} userData={userData} onNext={() => setStep(3)} />,
    <Step3Ollama key={3} onFinish={handleFinish} />,
  ];

  return (
    <div>
      <StepIndicator step={step} />
      {steps[step - 1]}
    </div>
  );
}

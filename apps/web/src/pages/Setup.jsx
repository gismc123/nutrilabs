import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  setupUser, updateSettings, createProfile, testOllamaConnection,
} from '../api/client.js';
import { dollarsToCents } from '../utils/currency.js';

const TOTAL_STEPS = 4;

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

function Step1({ onNext }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => setupUser(data),
    onSuccess: () => onNext(),
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Passwords do not match'); return; }
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    mutation.mutate({ email, password });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Create your account</h2>
      <p className="text-sm text-neutral-500 mb-6">Set up your NutriLabs login — you're the only one who will use this.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <button type="submit" disabled={mutation.isPending}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </div>
  );
}

function Step2({ onNext }) {
  const [budget, setBudget] = useState('120');
  const [eatingOutRef, setEatingOutRef] = useState('12');
  const [calories, setCalories] = useState('1800');

  const mutation = useMutation({
    mutationFn: (data) => updateSettings(data),
    onSuccess: () => onNext(),
    onError: (err) => toast.error(err.message),
  });

  const handleContinue = () => {
    mutation.mutate({
      weeklyBudget: dollarsToCents(budget),
      eatingOutReference: dollarsToCents(eatingOutRef),
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Set your goals</h2>
      <p className="text-sm text-neutral-500 mb-6">These help NutriLabs track your spending and savings. You can change them any time in Settings.</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Weekly grocery budget</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
            <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} min="0" step="0.01"
              className="w-full pl-7 pr-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Estimated cost per meal eating out</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">$</span>
            <input type="number" value={eatingOutRef} onChange={(e) => setEatingOutRef(e.target.value)} min="0" step="0.01"
              className="w-full pl-7 pr-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <p className="text-xs text-neutral-400 mt-1">Used to calculate how much you save by cooking at home.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Your daily calorie goal</label>
          <input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} min="0"
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <button onClick={handleContinue} disabled={mutation.isPending}
          className="w-full py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {mutation.isPending ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

function Step3({ onNext }) {
  const [children, setChildren] = useState([{ name: '', age: '' }]);

  const addMutation = useMutation({
    mutationFn: (profiles) => Promise.all(profiles.map((p) => createProfile(p))),
    onSuccess: () => onNext(),
    onError: (err) => toast.error(err.message),
  });

  const handleAddRow = () => setChildren([...children, { name: '', age: '' }]);
  const handleRemoveRow = (i) => setChildren(children.filter((_, idx) => idx !== i));
  const handleChange = (i, field, val) => setChildren(children.map((c, idx) => idx === i ? { ...c, [field]: val } : c));

  const handleSubmit = () => {
    const filled = children.filter((c) => c.name.trim());
    if (filled.length === 0) { onNext(); return; }
    const profiles = filled.map((c) => ({
      name: c.name.trim(),
      age: c.age ? parseInt(c.age) : undefined,
      avatarColor: '#3b82f6',
      isPlanner: false,
    }));
    addMutation.mutate(profiles);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Your household</h2>
      <p className="text-sm text-neutral-500 mb-6">Your profile (Ivan) is already set up. Add your children so NutriLabs can plan kid-friendly meals on the right days.</p>

      <div className="bg-primary-50 rounded-xl p-3 flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-bold">IV</div>
        <div>
          <p className="text-sm font-medium text-neutral-900">Ivan</p>
          <p className="text-xs text-neutral-500">Planner · You</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        {children.map((child, i) => (
          <div key={i} className="flex gap-2">
            <input type="text" value={child.name} onChange={(e) => handleChange(i, 'name', e.target.value)}
              placeholder="Child's name"
              className="flex-1 px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
            <input type="number" value={child.age} onChange={(e) => handleChange(i, 'age', e.target.value)}
              placeholder="Age" min="0" max="18"
              className="w-20 px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
            {children.length > 1 && (
              <button onClick={() => handleRemoveRow(i)} className="px-2 text-neutral-400 hover:text-danger-500">×</button>
            )}
          </div>
        ))}
      </div>

      <button onClick={handleAddRow} className="text-sm text-primary-600 hover:text-primary-700 font-medium mb-6">
        + Add another child
      </button>

      <div className="flex gap-3">
        <button onClick={handleSubmit} disabled={addMutation.isPending}
          className="flex-1 py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
          {addMutation.isPending ? 'Saving...' : 'Continue'}
        </button>
        <button onClick={onNext} className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">
          Skip
        </button>
      </div>
    </div>
  );
}

function Step4({ onFinish }) {
  const navigate = useNavigate();
  const [host, setHost] = useState('http://192.168.1.190:11434');
  const [testResult, setTestResult] = useState(null);

  const testMutation = useMutation({
    mutationFn: testOllamaConnection,
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestResult({ connected: false, message: err.message }),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => updateSettings(data),
    onSuccess: () => {
      toast.success('Setup complete! Welcome to NutriLabs.');
      navigate('/');
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFinish = () => saveMutation.mutate({ ollamaHost: host });
  const handleSkip = () => navigate('/');

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-1">Connect to Ollama</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Ollama is your local AI running on your home network — it powers meal suggestions and spending insights without sending data to the cloud.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Ollama host URL</label>
          <input type="url" value={host} onChange={(e) => setHost(e.target.value)}
            className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <button onClick={() => testMutation.mutate()} disabled={testMutation.isPending}
          className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors">
          {testMutation.isPending ? 'Testing...' : 'Test connection'}
        </button>
        {testResult && (
          <p className={`text-sm ${testResult.connected ? 'text-primary-600' : 'text-neutral-500'}`}>
            {testResult.connected ? `✓ ${testResult.message || 'Connected'}` : `Couldn't connect — ${testResult.message}`}
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={handleFinish} disabled={saveMutation.isPending}
            className="flex-1 py-3 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saveMutation.isPending ? 'Saving...' : 'Finish setup'}
          </button>
          <button onClick={handleSkip} className="px-4 py-3 text-sm font-medium text-neutral-500 hover:text-neutral-700">
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Setup() {
  const [step, setStep] = useState(1);

  useEffect(() => {
    document.title = 'NutriLabs — Setup';
  }, []);

  const steps = [Step1, Step2, Step3, Step4];
  const StepComponent = steps[step - 1];

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="NutriLabs" className="w-16 h-16 rounded-2xl shadow-sm mx-auto mb-3" />
          <h1 className="text-3xl font-extrabold text-primary-600">NutriLabs</h1>
          <p className="text-sm text-neutral-400 mt-1">Your self-hosted meal planner</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-6 md:p-8">
          <StepIndicator step={step} />
          <StepComponent
            onNext={() => setStep((s) => s + 1)}
            onFinish={() => {}}
          />
        </div>
      </div>
    </div>
  );
}

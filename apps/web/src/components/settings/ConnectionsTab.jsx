import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { IconCheck, IconX, IconLoader } from '@tabler/icons-react';
import {
  getOllamaModels, testOllamaConnection,
  testKrogerConnection, testSpoonacularConnection, testUsdaConnection,
  getSpoonacularQuota, updateSettings, testSmtp,
} from '../../api/client.js';
import { useSettings } from '../../hooks/useSettings.js';

const MASK = '••••••••';

function ConnectionStatus({ status }) {
  if (!status) return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs mt-2 ${status.connected ? 'text-primary-600' : 'text-danger-600'}`}>
      {status.connected ? <IconCheck size={14} /> : <IconX size={14} />}
      {status.message}
    </div>
  );
}

function TestButton({ onClick, isPending, label = 'Test connection' }) {
  return (
    <button onClick={onClick} disabled={isPending}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50 disabled:opacity-50 transition-colors">
      {isPending ? <IconLoader size={14} className="animate-spin" /> : null}
      {isPending ? 'Testing...' : label}
    </button>
  );
}

function SectionDivider({ title }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</span>
      <div className="flex-1 h-px bg-neutral-100" />
    </div>
  );
}

function MaskedInput({ value, isSet, placeholder, onChange, onBlur }) {
  const [focused, setFocused] = useState(false);
  const [localVal, setLocalVal] = useState('');

  const handleFocus = () => { setFocused(true); setLocalVal(''); };
  const handleBlur = () => {
    setFocused(false);
    if (localVal) onChange(localVal);
    onBlur?.();
  };

  return (
    <input
      type="password"
      value={focused ? localVal : (isSet ? MASK : '')}
      onChange={(e) => setLocalVal(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={isSet ? MASK : placeholder}
      className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600"
    />
  );
}

export default function ConnectionsTab() {
  const { settings, updateSettings: saveSettings } = useSettings();
  const saveTimer = useRef(null);

  const [ollamaHost, setOllamaHost] = useState('');
  const [ollamaModel, setOllamaModel] = useState('');
  const [krogerZip, setKrogerZip] = useState('');
  const [spoonKey, setSpoonKey] = useState('');
  const [usdaKey, setUsdaKey] = useState('');

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromAddress, setSmtpFromAddress] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('NutriLabs');
  const [appBaseUrl, setAppBaseUrl] = useState('');

  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [krogerStatus, setKrogerStatus] = useState(null);
  const [spoonStatus, setSpoonStatus] = useState(null);
  const [usdaStatus, setUsdaStatus] = useState(null);
  const [smtpStatus, setSmtpStatus] = useState(null);

  useEffect(() => {
    if (!settings) return;
    setOllamaHost(settings.ollamaHost ?? 'http://192.168.1.190:11434');
    setOllamaModel(settings.ollamaModel ?? '');
    setKrogerZip(settings.krogerZip ?? '');
    setSmtpHost(settings.smtpHost ?? '');
    setSmtpPort(String(settings.smtpPort ?? 587));
    setSmtpUser(settings.smtpUser ?? '');
    setSmtpFromAddress(settings.smtpFromAddress ?? '');
    setSmtpFromName(settings.smtpFromName ?? 'NutriLabs');
    setAppBaseUrl(settings.appBaseUrl ?? '');
  }, [settings]);

  const { data: models } = useQuery({
    queryKey: ['ollama-models'],
    queryFn: getOllamaModels,
    retry: false,
  });

  const { data: quota } = useQuery({
    queryKey: ['spoonacular-quota'],
    queryFn: getSpoonacularQuota,
    staleTime: 60_000,
  });

  const ollamaTestMutation = useMutation({
    mutationFn: testOllamaConnection,
    onSuccess: (data) => setOllamaStatus(data),
    onError: (err) => setOllamaStatus({ connected: false, message: err.message }),
  });

  const krogerTestMutation = useMutation({
    mutationFn: testKrogerConnection,
    onSuccess: (data) => setKrogerStatus(data),
    onError: (err) => setKrogerStatus({ connected: false, message: err.message }),
  });

  const spoonTestMutation = useMutation({
    mutationFn: () => testSpoonacularConnection(spoonKey ? { apiKey: spoonKey } : {}),
    onSuccess: (data) => setSpoonStatus(data),
    onError: (err) => setSpoonStatus({ connected: false, message: err.message }),
  });

  const usdaTestMutation = useMutation({
    mutationFn: () => testUsdaConnection(usdaKey ? { apiKey: usdaKey } : {}),
    onSuccess: (data) => setUsdaStatus(data),
    onError: (err) => setUsdaStatus({ connected: false, message: err.message }),
  });

  const smtpTestMutation = useMutation({
    mutationFn: () => testSmtp({
      smtpHost, smtpPort: parseInt(smtpPort), smtpUser,
      smtpPassword: smtpPassword || undefined,
      smtpFromAddress, smtpFromName,
    }),
    onSuccess: (data) => setSmtpStatus(data),
    onError: (err) => setSmtpStatus({ connected: false, message: err.message }),
  });

  const debouncedSave = (updates) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveSettings(updates), 500);
  };

  return (
    <div className="space-y-2">
      <SectionDivider title="Ollama" />
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Host URL</label>
          <input type="url" value={ollamaHost}
            onChange={(e) => { setOllamaHost(e.target.value); debouncedSave({ ollamaHost: e.target.value }); }}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Model</label>
          {Array.isArray(models) && models.length > 0 ? (
            <select value={ollamaModel} onChange={(e) => { setOllamaModel(e.target.value); debouncedSave({ ollamaModel: e.target.value }); }}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-600">
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input type="text" value={ollamaModel}
              onChange={(e) => { setOllamaModel(e.target.value); debouncedSave({ ollamaModel: e.target.value }); }}
              placeholder="e.g. llama3.1:8b-instruct-q5_K_M"
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          )}
        </div>
        <TestButton onClick={() => ollamaTestMutation.mutate()} isPending={ollamaTestMutation.isPending} />
        <ConnectionStatus status={ollamaStatus} />
      </div>

      <SectionDivider title="Kroger API" />
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">
          Optional. Enables real-time grocery pricing. Set <code className="bg-neutral-100 px-1 rounded">KROGER_CLIENT_ID</code> and <code className="bg-neutral-100 px-1 rounded">KROGER_CLIENT_SECRET</code> in your <code className="bg-neutral-100 px-1 rounded">.env</code> file.
        </p>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Zip code</label>
          <input type="text" value={krogerZip} onChange={(e) => { setKrogerZip(e.target.value); debouncedSave({ krogerZip: e.target.value }); }}
            placeholder="e.g. 90210" maxLength={10}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div className={`text-xs px-2 py-1 rounded-lg inline-block ${settings?.krogerConfigured ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500'}`}>
          {settings?.krogerConfigured ? 'Credentials configured via environment' : 'Not configured'}
        </div>
        <TestButton onClick={() => krogerTestMutation.mutate()} isPending={krogerTestMutation.isPending} />
        <ConnectionStatus status={krogerStatus} />
      </div>

      <SectionDivider title="Spoonacular" />
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">Optional. Enables searching millions of recipes. Register free at <span className="text-primary-600">spoonacular.com</span></p>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">API key</label>
          <MaskedInput
            isSet={settings?.spoonacularConfigured}
            placeholder="Enter API key"
            onChange={(val) => { setSpoonKey(val); debouncedSave({ spoonacularApiKey: val }); }}
          />
        </div>
        {quota && (
          <p className="text-xs text-neutral-400">{quota.used} of {quota.limit} searches used today</p>
        )}
        <TestButton onClick={() => spoonTestMutation.mutate()} isPending={spoonTestMutation.isPending} />
        <ConnectionStatus status={spoonStatus} />
      </div>

      <SectionDivider title="USDA FoodData Central" />
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">
          Optional. Leave blank to use DEMO_KEY (30 req/hr, 50/day). Get a free key at <span className="text-primary-600">fdc.nal.usda.gov</span> for higher limits.
        </p>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">API key (optional)</label>
          <MaskedInput
            isSet={settings?.usdaConfigured && !!settings?.usdaApiKey}
            placeholder="Leave blank to use DEMO_KEY"
            onChange={(val) => { setUsdaKey(val); debouncedSave({ usdaApiKey: val }); }}
          />
        </div>
        <TestButton onClick={() => usdaTestMutation.mutate()} isPending={usdaTestMutation.isPending} />
        <ConnectionStatus status={usdaStatus} />
      </div>

      <SectionDivider title="Email / SMTP" />
      <div className="space-y-3">
        <p className="text-xs text-neutral-400">
          Required for password reset emails. Two easy options:
        </p>
        <div className="bg-neutral-50 rounded-lg p-3 text-xs text-neutral-600 space-y-1">
          <p><strong>Resend:</strong> host <code className="bg-white px-1 rounded">smtp.resend.com</code>, port 587, username <code className="bg-white px-1 rounded">resend</code>, password is your API key. Free: 100 emails/day.</p>
          <p><strong>Gmail:</strong> host <code className="bg-white px-1 rounded">smtp.gmail.com</code>, port 587, username is your Gmail, password is a 16-char app password from myaccount.google.com/apppasswords.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP host</label>
            <input type="text" value={smtpHost} placeholder="smtp.resend.com"
              onChange={(e) => { setSmtpHost(e.target.value); debouncedSave({ smtpHost: e.target.value || null }); }}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Port</label>
            <input type="number" value={smtpPort} placeholder="587"
              onChange={(e) => { setSmtpPort(e.target.value); debouncedSave({ smtpPort: parseInt(e.target.value) || null }); }}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP username</label>
          <input type="text" value={smtpUser} placeholder="resend or your.email@gmail.com"
            onChange={(e) => { setSmtpUser(e.target.value); debouncedSave({ smtpUser: e.target.value || null }); }}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">SMTP password</label>
          <input type="password" value={smtpPassword} placeholder="Password or API key"
            onChange={(e) => { setSmtpPassword(e.target.value); debouncedSave({ smtpPassword: e.target.value || null }); }}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">From address</label>
            <input type="email" value={smtpFromAddress} placeholder="nutrilabs@yourdomain.com"
              onChange={(e) => { setSmtpFromAddress(e.target.value); debouncedSave({ smtpFromAddress: e.target.value || null }); }}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">From name</label>
            <input type="text" value={smtpFromName} placeholder="NutriLabs"
              onChange={(e) => { setSmtpFromName(e.target.value); debouncedSave({ smtpFromName: e.target.value || 'NutriLabs' }); }}
              className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Your app URL (used in reset email links)</label>
          <input type="url" value={appBaseUrl} placeholder="http://localhost:1042"
            onChange={(e) => { setAppBaseUrl(e.target.value); debouncedSave({ appBaseUrl: e.target.value || null }); }}
            className="w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600" />
        </div>
        <TestButton onClick={() => smtpTestMutation.mutate()} isPending={smtpTestMutation.isPending} label="Test connection" />
        <ConnectionStatus status={smtpStatus} />
      </div>
    </div>
  );
}

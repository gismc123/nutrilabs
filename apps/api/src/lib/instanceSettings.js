import prisma from './prisma.js';

// Settings that make the server connect somewhere (Ollama, SMTP) or that go into
// emails (base URL) belong to the instance, not to individual users: letting any
// user set them would let them aim the server at internal hosts (SSRF) or
// receive other people's password-reset links. They come from the admin's saved
// settings, then .env.
export const ADMIN_ONLY_SETTINGS = [
  'ollamaHost', 'ollamaModel',
  'smtpHost', 'smtpPort', 'smtpUser', 'smtpPassword', 'smtpFromAddress', 'smtpFromName',
  'appBaseUrl',
];

const DEFAULT_OLLAMA_HOST = 'http://192.168.1.190:11434';
const CACHE_MS = 30_000;
let cached = null;

async function adminSettings() {
  if (cached && cached.at > Date.now() - CACHE_MS) return cached.value;
  const value = await prisma.appSettings.findFirst({
    where: { user: { isAdmin: true, isActive: true } },
    orderBy: { userId: 'asc' },
  });
  cached = { at: Date.now(), value };
  return value;
}

/** Call after the admin saves settings so the next request sees them. */
export function clearInstanceSettingsCache() {
  cached = null;
}

export async function getInstanceSettings() {
  const a = (await adminSettings()) ?? {};
  const env = process.env;
  // The admin's saved values win (as documented in .env.example); .env fills gaps.
  const smtpFromAdmin = !!a.smtpHost;
  return {
    ollamaHost: a.ollamaHost || env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST,
    ollamaModel: a.ollamaModel || env.OLLAMA_MODEL || 'llama3',
    smtpHost: smtpFromAdmin ? a.smtpHost : env.SMTP_HOST,
    smtpPort: smtpFromAdmin ? a.smtpPort : Number(env.SMTP_PORT) || 587,
    smtpUser: smtpFromAdmin ? a.smtpUser : env.SMTP_USER,
    smtpPassword: smtpFromAdmin ? a.smtpPassword : env.SMTP_PASSWORD,
    smtpFromAddress: smtpFromAdmin ? a.smtpFromAddress : env.SMTP_FROM_ADDRESS,
    smtpFromName: (smtpFromAdmin ? a.smtpFromName : env.SMTP_FROM_NAME) || 'NutriLabs',
    appBaseUrl: a.appBaseUrl || env.APP_BASE_URL || env.BASE_URL || 'http://localhost:1042',
  };
}

/** A user's settings with the instance-wide values (Ollama etc.) filled in. */
export async function settingsForUser(userId) {
  const [own, instance] = await Promise.all([
    prisma.appSettings.findUnique({ where: { userId } }),
    getInstanceSettings(),
  ]);
  return { ...(own ?? {}), ollamaHost: instance.ollamaHost, ollamaModel: instance.ollamaModel };
}

// Third-party API keys: the key saved in Settings wins, the .env key is the
// fallback. USDA additionally works (heavily rate-limited) with its DEMO_KEY.

function pick(settingsValue, envValue) {
  const fromSettings = settingsValue?.trim();
  if (fromSettings) return { key: fromSettings, source: 'settings' };
  const fromEnv = envValue?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  return null;
}

/** { key, source: 'settings' | 'env' | null } */
export function spoonacularKey(settings) {
  return pick(settings?.spoonacularApiKey, process.env.SPOONACULAR_API_KEY) ?? { key: null, source: null };
}

/** { key, source: 'settings' | 'env' | 'demo' } — a null key means the service uses DEMO_KEY. */
export function usdaKey(settings) {
  return pick(settings?.usdaApiKey, process.env.USDA_API_KEY) ?? { key: null, source: 'demo' };
}

// Shared mutable state for Ollama connection status.
// Updated by POST /api/ollama/test; read by GET /api/health.
export const ollamaState = {
  connected: false,
  lastCheckedAt: 0,
};

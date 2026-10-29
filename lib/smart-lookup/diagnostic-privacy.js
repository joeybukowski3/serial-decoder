const CREDENTIAL_NAMES = [
  'OPENAI_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY',
  'SERPER_API_KEY', 'UPSTASH_REDIS_REST_TOKEN',
];

export function redactDiagnosticSecrets(value, env = process.env) {
  let text = String(value ?? '')
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
    .replace(/("(?:api[_-]?key|access[_-]?token|authorization|password|secret)"\s*:\s*")[^"]*/gi, '$1[REDACTED]');
  for (const name of CREDENTIAL_NAMES) {
    const credential = env[name];
    if (typeof credential === 'string' && credential.length >= 8) text = text.replaceAll(credential, '[REDACTED]');
  }
  return text;
}

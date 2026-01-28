export function getGeminiApiKey(): string | undefined {
  const ls = typeof window !== 'undefined' ? window.localStorage.getItem('GEMINI_API_KEY') || undefined : undefined;
  const vite = (import.meta as any)?.env?.VITE_GEMINI_API_KEY || (import.meta as any)?.env?.VITE_API_KEY || undefined;
  const proc = (process as any)?.env?.GEMINI_API_KEY || (process as any)?.env?.API_KEY || undefined;
  return ls || vite || proc;
}

export function setGeminiApiKey(key: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('GEMINI_API_KEY', key);
  }
}

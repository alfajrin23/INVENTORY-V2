function mappedKey(value, prefix) {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return undefined
    return Object.values(parsed).find(key => typeof key === 'string' && key.startsWith(prefix))
  } catch {
    return undefined
  }
}

export function supabasePublicKey(env, requestApiKey) {
  return env.get('SUPABASE_ANON_KEY')
    ?? env.get('SUPABASE_PUBLISHABLE_KEY')
    ?? mappedKey(env.get('SUPABASE_PUBLISHABLE_KEYS'), 'sb_publishable_')
    ?? requestApiKey
    ?? undefined
}

export function supabaseServiceKey(env) {
  return env.get('SUPABASE_SERVICE_ROLE_KEY')
    ?? env.get('SUPABASE_SECRET_KEY')
    ?? mappedKey(env.get('SUPABASE_SECRET_KEYS'), 'sb_secret_')
}

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function env(name) {
  try { return Netlify.env.get(name); } catch { return process.env[name]; }
}

export async function requireInternalAuth(request) {
  if (String(env('INTERNAL_AUTH_DISABLED') || '').toLowerCase() === 'true') {
    return { ok: true, developmentBypass: true };
  }

  const supabaseUrl = env('SUPABASE_URL');
  const anonKey = env('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    return { ok: false, status: 503, error: 'Autenticação interna não configurada no servidor.' };
  }

  const authorization = request.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Sessão obrigatória.' };
  }

  try {
    const base = supabaseUrl.replace(/\/$/, '');
    const userResponse = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization }
    });
    if (!userResponse.ok) return { ok: false, status: 401, error: 'Sessão inválida ou expirada.' };
    const user = await userResponse.json();

    const membershipResponse = await fetch(`${base}/rest/v1/organization_members?user_id=eq.${encodeURIComponent(user.id)}&select=organization_id,role&limit=1`, {
      headers: { apikey: anonKey, Authorization: authorization, Accept: 'application/json' }
    });
    const memberships = membershipResponse.ok ? await membershipResponse.json() : [];
    if (!memberships?.length) return { ok: false, status: 403, error: 'Usuário sem acesso ao Achilles Command.' };

    return { ok: true, user, membership: memberships[0] };
  } catch {
    return { ok: false, status: 503, error: 'Não foi possível validar a sessão.' };
  }
}

export function authError(result) {
  return new Response(JSON.stringify({ error: result.error }), { status: result.status || 401, headers: jsonHeaders });
}

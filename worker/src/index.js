// API « entraîneur » : reçoit les résultats structurés du moteur et demande à Claude
// une explication courte. La clé Anthropic n'existe que dans les secrets du Worker.
//
// Protections : code d'accès vérifié côté serveur (comparaison à temps constant),
// verrouillage après échecs répétés, limite par minute, plafond quotidien, CORS,
// taille de requête bornée. Les compteurs vivent dans un Durable Object unique.
import Anthropic from '@anthropic-ai/sdk';
import { DurableObject } from 'cloudflare:workers';
import { SYSTEM_PROMPT, buildUserMessage, validatePayload } from './prompt.js';

const MAX_BODY = 16 * 1024;
const EXPLORER_URL = 'https://explorer.lichess.org/lichess';
const EXPLORER_PARAMS = ['variant', 'fen', 'play', 'speeds', 'ratings', 'since', 'until', 'moves', 'topGames', 'recentGames'];
// Modèles acceptant le repli serveur `fallbacks: "default"` (refus des classifieurs de sécurité).
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']);

export class Gate extends DurableObject {
  async _get(key, fresh) {
    const v = await this.ctx.storage.get(key);
    return v && v.period === fresh.period ? v : fresh;
  }

  // Échecs d'authentification : 10 par heure et par IP, 30 par heure au total.
  async authBlocked(ip) {
    const hour = Math.floor(Date.now() / 3600000);
    const f = await this._get('fails', { period: hour, total: 0, ips: {} });
    return f.total >= 30 || (f.ips[ip] || 0) >= 10;
  }

  async recordFail(ip) {
    const hour = Math.floor(Date.now() / 3600000);
    const f = await this._get('fails', { period: hour, total: 0, ips: {} });
    f.total += 1;
    f.ips[ip] = (f.ips[ip] || 0) + 1;
    await this.ctx.storage.put('fails', f);
  }

  // Relais Opening Explorer : limite séparée, sans toucher au quota Claude.
  async consumeExplorer(perMinute) {
    const minute = Math.floor(Date.now() / 60000);
    const m = await this._get('xminute', { period: minute, count: 0 });
    if (m.count >= perMinute) return false;
    m.count += 1;
    await this.ctx.storage.put('xminute', m);
    return true;
  }

  async usage(dailyLimit) {
    const day = new Date().toISOString().slice(0, 10);
    const d = await this._get('day', { period: day, count: 0 });
    return { usedToday: d.count, dailyLimit };
  }

  // Réserve un appel. Opérations sérialisées par le Durable Object : pas de course possible.
  async consume(perMinute, dailyLimit) {
    const day = new Date().toISOString().slice(0, 10);
    const minute = Math.floor(Date.now() / 60000);
    const d = await this._get('day', { period: day, count: 0 });
    const m = await this._get('minute', { period: minute, count: 0 });
    if (d.count >= dailyLimit) return { ok: false, reason: 'daily', usedToday: d.count };
    if (m.count >= perMinute) return { ok: false, reason: 'minute', usedToday: d.count };
    d.count += 1;
    m.count += 1;
    await this.ctx.storage.put({ day: d, minute: m });
    return { ok: true, usedToday: d.count, remaining: dailyLimit - d.count };
  }
}

function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-headers'] = 'authorization, content-type';
    h['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    h['access-control-max-age'] = '86400';
  }
  return { headers: h, allowed: !origin || allowed.includes(origin) };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function checkCode(provided, expected) {
  const a = await sha256(provided || '');
  const b = await sha256(expected);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Relaie une requête vers l'Opening Explorer avec le jeton Lichess stocké dans les secrets.
// Seuls les paramètres documentés sont transmis ; réponses mises en cache 24 h.
async function explorerRelay(url, env, gate, headers) {
  if (!env.LICHESS_TOKEN) return json({ error: 'Relais Lichess non configuré (secret LICHESS_TOKEN absent).' }, 503, headers);
  if (!(await gate.consumeExplorer(Number(env.EXPLORER_PER_MINUTE || 60)))) {
    return json({ error: 'Trop de requêtes vers l’explorateur, patientez une minute.' }, 429, headers);
  }
  const qs = new URLSearchParams();
  for (const k of EXPLORER_PARAMS) if (url.searchParams.has(k)) qs.set(k, url.searchParams.get(k).slice(0, 2000));
  const target = `${env.EXPLORER_URL || EXPLORER_URL}?${qs}`;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const cacheKey = new Request(target);
  const hit = cache && (await cache.match(cacheKey));
  if (hit) return new Response(hit.body, { status: 200, headers: { ...headers, 'content-type': 'application/json', 'x-cache': 'hit' } });
  let res;
  try {
    res = await fetch(target, { headers: { authorization: `Bearer ${env.LICHESS_TOKEN}`, accept: 'application/json' } });
  } catch {
    return json({ error: 'Opening Explorer injoignable.' }, 502, headers);
  }
  if (res.status === 429) return json({ error: 'Lichess limite les requêtes : réessayez dans une minute.' }, 429, headers);
  if (res.status === 401) return json({ error: 'Jeton Lichess du relais refusé (secret LICHESS_TOKEN).' }, 502, headers);
  if (!res.ok) return json({ error: `Opening Explorer : HTTP ${res.status}` }, 502, headers);
  const body = await res.text();
  if (cache) await cache.put(cacheKey, new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } }));
  return new Response(body, { status: 200, headers: { ...headers, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('API Coach Échecs : accès réservé.\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (!cors.allowed) return json({ error: 'Origine non autorisée' }, 403, cors.headers);
    if (!['/v1/status', '/v1/explain', '/v1/explorer'].includes(url.pathname)) return json({ error: 'Introuvable' }, 404, cors.headers);

    if (!env.ACCESS_CODE || env.ACCESS_CODE.length < 8) {
      return json({ error: 'Serveur mal configuré : code d’accès absent ou trop court (8 caractères minimum).' }, 503, cors.headers);
    }

    const gate = env.GATE.get(env.GATE.idFromName('global'));
    const ip = request.headers.get('cf-connecting-ip') || 'inconnue';
    if (await gate.authBlocked(ip)) return json({ error: 'Trop d’échecs d’authentification. Réessayez dans une heure.' }, 429, cors.headers);
    const auth = request.headers.get('authorization') || '';
    const code = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!(await checkCode(code, env.ACCESS_CODE))) {
      await gate.recordFail(ip);
      return json({ error: 'Code d’accès invalide' }, 401, cors.headers);
    }

    const model = env.CLAUDE_MODEL || 'claude-opus-5-5';
    const dailyLimit = Number(env.DAILY_LIMIT || 100);
    const perMinute = Number(env.PER_MINUTE_LIMIT || 8);

    if (url.pathname === '/v1/status' && request.method === 'GET') {
      const u = await gate.usage(dailyLimit);
      return json({ ok: true, model, claudeConfigured: !!env.ANTHROPIC_API_KEY, explorerProxy: !!env.LICHESS_TOKEN, ...u }, 200, cors.headers);
    }
    if (url.pathname === '/v1/explorer' && request.method === 'GET') return explorerRelay(url, env, gate, cors.headers);
    if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405, cors.headers);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Clé API Anthropic absente des secrets du Worker.' }, 503, cors.headers);

    const raw = await request.text();
    if (raw.length > MAX_BODY) return json({ error: 'Requête trop volumineuse' }, 413, cors.headers);
    let payload;
    try { payload = JSON.parse(raw); } catch { return json({ error: 'JSON invalide' }, 400, cors.headers); }
    const invalid = validatePayload(payload);
    if (invalid) return json({ error: invalid }, 400, cors.headers);

    const quota = await gate.consume(perMinute, dailyLimit);
    if (!quota.ok) {
      const msg = quota.reason === 'daily'
        ? `Plafond quotidien atteint (${dailyLimit} explications). Il se réinitialise à minuit UTC.`
        : 'Trop de demandes en une minute. Patientez un instant.';
      return json({ error: msg }, 429, cors.headers);
    }

    const client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.ANTHROPIC_BASE_URL || undefined, // uniquement pour les tests locaux
      maxRetries: 1,
      timeout: 60000,
    });
    const params = {
      model,
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(payload) }],
    };
    // Réponses courtes : effort réduit (réglable) sur les modèles qui le prennent en charge.
    if (/^claude-(opus|sonnet|haiku|fable)-5/.test(model)) params.output_config = { effort: env.CLAUDE_EFFORT || 'low' };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    let msg;
    try {
      msg = await client.beta.messages.create(params);
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Clé API Anthropic refusée (vérifiez le secret ANTHROPIC_API_KEY).' }, 502, cors.headers);
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Limite de débit Anthropic atteinte, réessayez plus tard.' }, 429, cors.headers);
      if (e instanceof Anthropic.BadRequestError) return json({ error: 'Requête refusée par l’API Anthropic : ' + (e.message || '').slice(0, 200) }, 502, cors.headers);
      if (e instanceof Anthropic.APIError && e.status === 402) return json({ error: 'Crédits API Anthropic épuisés.' }, 502, cors.headers);
      if (e instanceof Anthropic.APIConnectionError) return json({ error: 'API Anthropic injoignable.' }, 502, cors.headers);
      return json({ error: 'Erreur de l’API Anthropic : ' + String(e.message || e).slice(0, 200) }, 502, cors.headers);
    }
    if (msg.stop_reason === 'refusal') return json({ error: 'Claude a décliné cette demande.' }, 502, cors.headers);
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    if (!text) return json({ error: 'Réponse vide de Claude.' }, 502, cors.headers);
    return json({
      text: msg.stop_reason === 'max_tokens' ? text + '\n(réponse tronquée)' : text,
      model: msg.model,
      usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens },
      remainingToday: quota.remaining,
    }, 200, cors.headers);
  },
};

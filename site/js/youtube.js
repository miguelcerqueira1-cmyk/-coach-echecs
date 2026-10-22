// Recherche de vidéos YouTube par fiche et par langue (API YouTube Data v3, clé personnelle).
// L'application trouve et classe des vidéos ; elle ne les « regarde » pas et n'en tire
// aucune donnée échiquéenne. Sans clé : liens de recherche YouTube par langue.

export const LANGS = {
  fr: { label: 'Français', mot: 'échecs' },
  en: { label: 'English', mot: 'chess' },
  es: { label: 'Español', mot: 'ajedrez' },
  de: { label: 'Deutsch', mot: 'Schach' },
  it: { label: 'Italiano', mot: 'scacchi' },
  pt: { label: 'Português', mot: 'xadrez' },
  ru: { label: 'Русский', mot: 'шахматы' },
};

const API = 'https://www.googleapis.com/youtube/v3';
const CACHE_KEY = 'coach-echecs:youtube-v1';
const TTL = 7 * 24 * 3600 * 1000;

export function queryFor(entry, lang) {
  const base = lang === 'fr' ? entry.nom.replace(/\s*\(.*?\)\s*/g, ' ').trim() : (entry.ecoNom || entry.video.recherche);
  return `${base} ${LANGS[lang]?.mot || 'chess'}`.replace(/\s+/g, ' ').trim();
}

export function searchLink(entry, lang) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(queryFor(entry, lang))}`;
}

// « PT1H2M3S » → « 1:02:03 »
export function isoDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '');
  if (!m) return '';
  const [h, mi, s] = [Number(m[1] || 0), Number(m[2] || 0), Number(m[3] || 0)];
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; } }
function saveCache(c) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* plein */ } }

export class YouTubeClient {
  constructor({ getKey, fetchImpl = (...a) => fetch(...a) }) {
    this.getKey = getKey;
    this.fetchImpl = fetchImpl;
  }

  hasKey() { return !!this.getKey(); }

  // Résultats (titre, chaîne, durée, vues) ; mis en cache 7 jours par requête.
  async search(entry, lang, max = 8) {
    const q = queryFor(entry, lang);
    const ck = `${lang}|${q}`;
    const cache = loadCache();
    if (cache[ck] && Date.now() - cache[ck].at < TTL) return cache[ck].items;
    const key = this.getKey();
    if (!key) throw new Error('Clé API YouTube non configurée (⚙ Réglages).');
    const sp = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: String(max), q, relevanceLanguage: lang, safeSearch: 'strict', key });
    const r = await this.fetchImpl(`${API}/search?${sp}`);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || r.status;
      if (reason === 'quotaExceeded') throw new Error('Quota YouTube du jour épuisé (environ 100 recherches par jour) : réessayez demain.');
      if (reason === 'keyInvalid' || r.status === 400) throw new Error('Clé API YouTube refusée.');
      if (r.status === 403) throw new Error('Clé API YouTube non autorisée pour ce site (vérifiez les restrictions de la clé).');
      throw new Error(`YouTube : erreur ${reason}`);
    }
    const ids = (data.items || []).map((it) => it.id?.videoId).filter(Boolean);
    let details = {};
    if (ids.length) {
      const dp = new URLSearchParams({ part: 'contentDetails,statistics', id: ids.join(','), key });
      const d = await this.fetchImpl(`${API}/videos?${dp}`);
      if (d.ok) for (const v of (await d.json()).items || []) details[v.id] = v;
    }
    const items = (data.items || []).filter((it) => it.id?.videoId).map((it) => ({
      id: it.id.videoId,
      title: it.snippet?.title || '',
      channel: it.snippet?.channelTitle || '',
      published: (it.snippet?.publishedAt || '').slice(0, 10),
      thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || '',
      duration: isoDuration(details[it.id.videoId]?.contentDetails?.duration),
      views: Number(details[it.id.videoId]?.statistics?.viewCount || 0),
    }));
    cache[ck] = { at: Date.now(), items };
    saveCache(cache);
    return items;
  }
}

// Le texte des titres YouTube arrive encodé en entités HTML (&#39;, &amp;…).
export function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}

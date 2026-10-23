// Contrôle en ligne des liens vidéo choisis à la main (site/data/repertoire.js, `video.liens`).
//
//   node scripts/verify-videos.mjs           → interroge l'oEmbed de YouTube pour chaque vidéo,
//                                              signale les liens morts et les titres/chaînes changés
//   node scripts/verify-videos.mjs --strict  → code de sortie 1 si un lien est mort
//
// Sans --strict, le script ne fait jamais échouer la CI (YouTube peut être capricieux) :
// sous GitHub Actions, chaque problème devient une annotation « warning ».
// youtube.com est bloqué depuis l'environnement de développement : ce contrôle ne tourne
// qu'en CI (job « online » de deploy.yml).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const OEMBED = 'https://www.youtube.com/oembed';

export function videoId(url) {
  const m = String(url).match(/[?&]v=([\w-]{11})(?:&|$)/);
  return m ? m[1] : null;
}

// Comparaison tolérante : casse, accents, ponctuation et apostrophes typographiques ignorés.
export const normText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sameish = (a, b) => { const x = normText(a); const y = normText(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };

// Liens à contrôler, regroupés par vidéo (une vidéo peut servir à plusieurs fiches).
export function collectLinks(lignes) {
  const byId = new Map();
  for (const e of lignes) {
    for (const l of e.video?.liens || []) {
      const id = videoId(l.url);
      if (!byId.has(id)) byId.set(id, { id, titre: l.titre, chaine: l.chaine, fiches: [] });
      byId.get(id).fiches.push(e.id);
    }
  }
  return [...byId.values()];
}

// Résultat par vidéo : ok | mort (404/400 : supprimée, privée ou identifiant faux) |
// restreinte (401/403 : intégration désactivée ou accès limité) | changement (titre ou chaîne
// différents) | a-completer (vidéo trouvée, chaîne non confirmée lors du choix : la vraie est
// indiquée) | erreur (réseau, 5xx, 429 : non concluant).
export async function checkVideo(v, fetchImpl = fetch) {
  const url = `${OEMBED}?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}&format=json`;
  let res;
  try {
    res = await fetchImpl(url, { headers: { 'user-agent': 'coach-echecs verify-videos (github.com/miguelcerqueira1-cmyk/-coach-echecs)' } });
  } catch (err) {
    return { ...v, etat: 'erreur', detail: `réseau : ${err.message}` };
  }
  if (res.status === 404 || res.status === 400) return { ...v, etat: 'mort', detail: `HTTP ${res.status}` };
  if (res.status === 401 || res.status === 403) return { ...v, etat: 'restreinte', detail: `HTTP ${res.status}` };
  if (!res.ok) return { ...v, etat: 'erreur', detail: `HTTP ${res.status}` };
  let data;
  try { data = await res.json(); } catch { return { ...v, etat: 'erreur', detail: 'réponse non JSON' }; }
  const diffs = [];
  if (!sameish(data.title, v.titre)) diffs.push(`titre « ${data.title} » (attendu « ${v.titre} »)`);
  if (v.chaine == null) diffs.push(`chaîne à renseigner : « ${data.author_name} »`);
  else if (!sameish(data.author_name, v.chaine)) diffs.push(`chaîne « ${data.author_name} » (attendu « ${v.chaine} »)`);
  const etat = diffs.length === 0 ? 'ok' : (v.chaine == null && diffs.length === 1 ? 'a-completer' : 'changement');
  return { ...v, etat, detail: diffs.join(' ; '), titreReel: data.title, chaineReelle: data.author_name };
}

export async function checkAll(videos, { fetchImpl = fetch, pauseMs = 200 } = {}) {
  const out = [];
  for (const v of videos) {
    out.push(await checkVideo(v, fetchImpl));
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
  }
  return out;
}

export function report(results, { github = false } = {}) {
  const lines = [];
  const bad = results.filter((r) => r.etat !== 'ok');
  for (const r of bad) {
    const msg = `${r.etat} : https://www.youtube.com/watch?v=${r.id} (${r.fiches.join(', ')}) ${r.detail}`.trim();
    lines.push(github ? `::warning title=Vidéo ${r.etat}::${msg.replace(/\r?\n/g, ' ')}` : msg);
  }
  const n = (k) => results.filter((r) => r.etat === k).length;
  lines.push(`vidéos : ${results.length} contrôlées — ${n('ok')} ok, ${n('mort')} mortes, ${n('restreinte')} restreintes, ${n('changement')} modifiées, ${n('a-completer')} chaînes à renseigner, ${n('erreur')} non concluantes`);
  return lines.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Node 22 n'utilise le proxy HTTPS de l'environnement que si NODE_USE_ENV_PROXY=1.
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } });
    process.exit(r.status ?? 1);
  }
  const { LIGNES } = await import('../site/data/repertoire.js');
  const results = await checkAll(collectLinks(LIGNES));
  console.log(report(results, { github: !!process.env.GITHUB_ACTIONS }));
  if (process.argv.includes('--strict') && results.some((r) => r.etat === 'mort')) process.exitCode = 1;
}

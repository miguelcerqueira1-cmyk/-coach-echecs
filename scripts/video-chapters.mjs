// Chapitres publiés par les auteurs des vidéos du répertoire (horodatages de la description YouTube).
//
//   node scripts/video-chapters.mjs   → pour chaque vidéo de `video.liens`, les lignes horodatées
//                                       de sa description (« 2:45 Variante … »), rien d'autre
//
// Sert à choisir un `&t=` vérifiable (règle : horodatage seulement depuis un chapitre publié par
// l'auteur). youtube.com est bloqué depuis l'environnement de développement : lancé en CI
// (.github/workflows/chapitres.yml, à la demande), résultat lu dans le journal.
import { pathToFileURL } from 'node:url';
import { collectLinks } from './verify-videos.mjs';

// Lignes horodatées d'une description (0:00, 2:45, 1:02:03), dans l'ordre.
export function chaptersOf(description) {
  const out = [];
  for (const line of String(description || '').split('\n')) {
    const m = line.match(/^\s*[-–•▶]?\s*\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–:|]?\s*(.{2,140})$/);
    if (!m) continue;
    const secs = m[1].split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
    out.push({ t: secs, label: m[2].trim() });
  }
  return out;
}

// Description d'une page YouTube (champ shortDescription de ytInitialPlayerResponse).
export function descriptionOf(html) {
  const m = String(html).match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try { return JSON.parse(`"${m[1]}"`); } catch { return null; }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { LIGNES } = await import('../site/data/repertoire.js');
  const headers = { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', cookie: 'CONSENT=YES+1' };
  const res = {};
  for (const v of collectLinks(LIGNES)) {
    let r = { fiches: v.fiches, titre: v.titre };
    try {
      const resp = await fetch(`https://www.youtube.com/watch?v=${v.id}&hl=fr`, { headers });
      const desc = resp.ok ? descriptionOf(await resp.text()) : null;
      r = { ...r, http: resp.status, description: desc != null, chapitres: chaptersOf(desc) };
    } catch (e) { r.erreur = e.message; }
    res[v.id] = r;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  console.log(`CHAPITRES ${JSON.stringify(res)}`);
  const n = Object.values(res);
  console.log(`vidéos : ${n.length} — description lue : ${n.filter((x) => x.description).length} — avec chapitres : ${n.filter((x) => x.chapitres?.length > 1).length}`);
}

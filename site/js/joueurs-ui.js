// Section « Parties de joueurs » de la page Répertoire (recherche par nom dans la barre data-q).
// Rendu seulement : données et correspondance dans joueurs.js ; ouverture via openGame (main.js).
import { searchPlayers, playerGames, normalizeName } from './joueurs.js';
import { eliteHeaders, PLATFORM_LABELS } from './elite.js';
import { langue } from './i18n.js';

// Phrases en français ou en anglais selon la langue de l'interface.
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_PLAYERS = 3;
const MAX_GAMES = 30;

const isNameQuery = (q) => normalizeName(q).replace(/ /g, '').length >= 3;

// Suggestions (datalist) : joueurs suivis puis comptes du top.
// Suggestions courtes (une longue liste fige Safari sur iPhone) : joueurs suivis, puis
// au plus `max` noms commençant par ce qui est tapé.
export function datalistHtml(idx, query = '', max = 12) {
  if (idx?.status !== 'ok') return '';
  const q = normalizeName(query);
  const all = [...new Map(idx.data.joueurs.map((j) => [j.n, j])).values()];
  const pick = q.length >= 2
    ? all.filter((j) => normalizeName(j.n).split(' ').some((w) => w.startsWith(q)) || normalizeName(j.n).startsWith(q))
    : all.filter((j) => j.s);
  return pick.sort((a, b) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || a.n.localeCompare(b.n)).slice(0, max)
    .map((j) => `<option value="${esc(j.n)}"></option>`).join('');
}

// idx : { status: 'loading' | 'ok' | 'unavailable', data } ; ficheCount : fiches trouvées par la même requête.
export function playersSectionHtml(idx, query, ficheCount) {
  if (!isNameQuery(query)) return '';
  if (!idx || idx.status === 'loading') return `<p class="state small"><span class="spinner"></span> ${L('Recherche dans les parties collectées…', 'Searching the collected games…')}</p>`;
  if (idx.status !== 'ok') return ficheCount ? '' : `<p class="muted small">${L(`Recherche par joueur indisponible : index des parties non publié (${esc(idx.error || '')}).`, `Player search unavailable: games index not published (${esc(idx.error || '')}).`)}</p>`;
  const found = searchPlayers(idx.data, query);
  if (!found.length) {
    if (ficheCount) return '';
    const m = idx.data.meta || {};
    const suivis = (m.suivis || []).map((s) => s.nom);
    return `<div class="card players-card players-none small"><p><strong>${L(`Aucun joueur « ${esc(query.trim())} » dans les données collectées.`, `No player “${esc(query.trim())}” in the collected data.`)}</strong></p>
      <p class="muted">${L(`Couvert : les joueurs du top 50 blitz et rapide de Lichess et de Chess.com, les joueurs suivis (${esc(suivis.join(', ') || 'aucun')} ; comptes en ligne vérifiés seulement) et les tournois retransmis sur Lichess (${(m.tournois || []).length} tournois, joueurs 2600+ ou suivis) — seulement leurs parties récentes qui atteignent nos ouvertures (Gambit Dame, Caro-Kann), transpositions comprises.`, `Covered: the top 50 blitz and rapid players on Lichess and Chess.com, followed players (${esc(suivis.join(', ') || 'none')}; verified online accounts only) and tournaments broadcast on Lichess (${(m.tournois || []).length} tournaments, players 2600+ or followed) — only their recent games that reach our openings (Queen’s Gambit, Caro-Kann), transpositions included.`)}</p></div>`;
  }
  return found.slice(0, MAX_PLAYERS).map((j) => playerHtml(idx.data, j)).join('')
    + (found.length > MAX_PLAYERS ? `<p class="muted tiny">${L(`${found.length - MAX_PLAYERS} autre(s) joueur(s) correspondent : précisez le nom.`, `${found.length - MAX_PLAYERS} other player(s) match: refine the name.`)}</p>` : '');
}

function playerHtml(data, j) {
  const games = playerGames(data, j);
  const accounts = (j.c || []).map((c) => `${PLATFORM_LABELS[c.p] || c.p} ${c.u}`).join(', ');
  const head = `<h3>${esc(j.n)}${j.s ? ` <span class="badge">${L('joueur suivi', 'followed player')}</span>` : ''}</h3>
    <p class="muted tiny">${accounts ? L(`Comptes : ${esc(accounts)} · `, `Accounts: ${esc(accounts)} · `) : ''}${L(`${games.length} partie(s) dans nos ouvertures (Gambit Dame, Caro-Kann, transpositions comprises) parmi les parties collectées.`, `${games.length} game(s) in our openings (Queen’s Gambit, Caro-Kann, transpositions included) among the collected games.`)}</p>`;
  if (!games.length) return `<div class="card players-card" data-player="${esc(j.n)}">${head}<p class="muted small">${L('Aucune partie récente de ce joueur dans nos ouvertures.', 'No recent game by this player in our openings.')}</p></div>`;
  const rows = games.slice(0, MAX_GAMES).map((g) => {
    const res = g.r === '1/2-1/2' ? '½-½' : g.r;
    const date = g.t ? new Date(g.t).toLocaleDateString(L('fr-FR', 'en-US')) : String(g.y || '');
    const won = (g.r === '1-0' && g.side === 'w') || (g.r === '0-1' && g.side === 'b');
    const lost = (g.r === '1-0' && g.side === 'b') || (g.r === '0-1' && g.side === 'w');
    return `<li class="pg">
      <div class="pg-top"><span class="dot ${g.side}" title="${g.side === 'w' ? L('Blancs', 'White') : L('Noirs', 'Black')}"></span>
        <span class="pg-opp">${L('contre', 'vs')} <strong>${esc(g.opponent)}</strong>${g.opponentElo ? ` <span class="muted">(${g.opponentElo})</span>` : ''}</span>
        <span class="pg-res ${won ? 'ok' : lost ? 'ko' : ''}">${esc(res)}</span></div>
      <div class="pg-meta muted small">${esc(date)} · ${esc(g.source)}${g.eco ? ` · ${esc(`${g.eco} ${g.n || ''}`)}` : ''}</div>
      <div class="pg-actions"><button type="button" class="small-btn" data-player-game="${esc(j.n)}|${esc(g.p)}:${esc(g.id)}">▶ ${L('Ouvrir sur l’échiquier', 'Open on the board')}</button> <a class="small" href="${esc(g.url)}" target="_blank" rel="noopener">${L('Partie d’origine ↗', 'Original game ↗')}</a></div>
    </li>`;
  }).join('');
  return `<div class="card players-card" data-player="${esc(j.n)}">${head}
    <ul class="players-games">${rows}</ul>
    ${games.length > MAX_GAMES ? `<p class="muted tiny">${L(`Les ${MAX_GAMES} plus récentes sur ${games.length}.`, `The ${MAX_GAMES} most recent of ${games.length}.`)}</p>` : ''}</div>`;
}

// Bouton « Ouvrir » → openGame(san, couleur du joueur cherché, libellé, en-têtes PGN).
export function bindPlayers(el, idx, openGame) {
  el?.querySelectorAll('[data-player-game]').forEach((b) => b.addEventListener('click', () => {
    const [name, key] = b.dataset.playerGame.split('|');
    const j = idx?.data?.joueurs.find((x) => x.n === name);
    const g = j && playerGames(idx.data, j).find((x) => `${x.p}:${x.id}` === key);
    if (g) openGame?.(g.san, g.side, L(`la partie ${g.label}`, `the game ${g.label}`), eliteHeaders(g));
  }));
}

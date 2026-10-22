// Section « Parties de joueurs » de la page Répertoire (recherche par nom dans la barre data-q).
// Rendu seulement : données et correspondance dans joueurs.js ; ouverture via openGame (main.js).
import { searchPlayers, playerGames, normalizeName } from './joueurs.js';
import { eliteHeaders, PLATFORM_LABELS } from './elite.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MAX_PLAYERS = 3;
const MAX_GAMES = 30;

const isNameQuery = (q) => normalizeName(q).replace(/ /g, '').length >= 3;

// Suggestions (datalist) : joueurs suivis puis comptes du top.
export function datalistHtml(idx) {
  if (idx?.status !== 'ok') return '';
  const names = idx.data.joueurs.slice().sort((a, b) => (b.s ? 1 : 0) - (a.s ? 1 : 0) || a.n.localeCompare(b.n)).map((j) => j.n);
  return [...new Set(names)].map((n) => `<option value="${esc(n)}"></option>`).join('');
}

// idx : { status: 'loading' | 'ok' | 'unavailable', data } ; ficheCount : fiches trouvées par la même requête.
export function playersSectionHtml(idx, query, ficheCount) {
  if (!isNameQuery(query)) return '';
  if (!idx || idx.status === 'loading') return '<p class="state small"><span class="spinner"></span> Recherche dans les parties collectées…</p>';
  if (idx.status !== 'ok') return ficheCount ? '' : `<p class="muted small">Recherche par joueur indisponible : index des parties non publié (${esc(idx.error || '')}).</p>`;
  const found = searchPlayers(idx.data, query);
  if (!found.length) {
    if (ficheCount) return '';
    const m = idx.data.meta || {};
    const suivis = (m.suivis || []).map((s) => s.nom);
    return `<div class="card players-card players-none small"><p><strong>Aucun joueur « ${esc(query.trim())} » dans les données collectées.</strong></p>
      <p class="muted">Couvert : les joueurs du top 50 blitz et rapide de Lichess et de Chess.com, les joueurs suivis (${esc(suivis.join(', ') || 'aucun')} ; comptes en ligne vérifiés seulement) et les tournois retransmis sur Lichess (${(m.tournois || []).length} tournois, joueurs 2600+ ou suivis) — seulement leurs parties récentes qui commencent par 1.d4 d5 2.c4 ou 1.e4 c6.</p></div>`;
  }
  return found.slice(0, MAX_PLAYERS).map((j) => playerHtml(idx.data, j)).join('')
    + (found.length > MAX_PLAYERS ? `<p class="muted tiny">${found.length - MAX_PLAYERS} autre(s) joueur(s) correspondent : précisez le nom.</p>` : '');
}

function playerHtml(data, j) {
  const games = playerGames(data, j);
  const accounts = (j.c || []).map((c) => `${PLATFORM_LABELS[c.p] || c.p} ${c.u}`).join(', ');
  const head = `<h3>${esc(j.n)}${j.s ? ' <span class="badge">joueur suivi</span>' : ''}</h3>
    <p class="muted tiny">${accounts ? `Comptes : ${esc(accounts)} · ` : ''}${games.length} partie(s) dans nos ouvertures (1.d4 d5 2.c4, 1.e4 c6) parmi les parties collectées.</p>`;
  if (!games.length) return `<div class="card players-card" data-player="${esc(j.n)}">${head}<p class="muted small">Aucune partie récente de ce joueur dans nos ouvertures.</p></div>`;
  const rows = games.slice(0, MAX_GAMES).map((g) => {
    const res = g.r === '1/2-1/2' ? '½-½' : g.r;
    const date = g.t ? new Date(g.t).toLocaleDateString('fr-FR') : String(g.y || '');
    return `<tr>
      <td class="tiny">${esc(date)}</td>
      <td><span class="dot ${g.side}" title="${g.side === 'w' ? 'Blancs' : 'Noirs'}"></span> contre ${esc(g.opponent)}${g.opponentElo ? ` (${g.opponentElo})` : ''}</td>
      <td class="num">${esc(res)}</td>
      <td class="small">${esc(g.source)}</td>
      <td class="small">${esc(g.eco ? `${g.eco} ${g.n || ''}` : '')}</td>
      <td><button type="button" class="small-btn" data-player-game="${esc(j.n)}|${esc(g.p)}:${esc(g.id)}">▶ Ouvrir</button> <a class="tiny" href="${esc(g.url)}" target="_blank" rel="noopener" title="Partie d’origine">↗</a></td>
    </tr>`;
  }).join('');
  return `<div class="card players-card" data-player="${esc(j.n)}">${head}
    <div class="rep-table-wrap"><table class="players-table"><thead><tr><th>Date</th><th>Adversaire</th><th>Résultat</th><th>Plateforme ou tournoi</th><th>Ouverture</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${games.length > MAX_GAMES ? `<p class="muted tiny">Les ${MAX_GAMES} plus récentes sur ${games.length}.</p>` : ''}</div>`;
}

// Bouton « Ouvrir » → openGame(san, couleur du joueur cherché, libellé, en-têtes PGN).
export function bindPlayers(el, idx, openGame) {
  el?.querySelectorAll('[data-player-game]').forEach((b) => b.addEventListener('click', () => {
    const [name, key] = b.dataset.playerGame.split('|');
    const j = idx?.data?.joueurs.find((x) => x.n === name);
    const g = j && playerGames(idx.data, j).find((x) => `${x.p}:${x.id}` === key);
    if (g) openGame?.(g.san, g.side, `la partie ${g.label}`, eliteHeaders(g));
  }));
}

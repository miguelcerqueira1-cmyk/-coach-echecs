// Page « Ma progression » (#/progression) : classements Lichess (historique public) et Chess.com
// (classement actuel + parties importées), routine sur 4 semaines, chiffres de l'entraînement.
import {
  seriesLichess, seriesParties, statsChessCom, chargerClassements, routineParSemaine, tendance, cheminCourbe,
} from './progression-core.js';
import { charger as chargerRoutine, blocsDuJour, profilDe, jour } from './routine-core.js';
import { loadProgress, vraiesErreurs } from './progress.js';
import { chargerFinales } from './finales.js';
import FINALES from '../data/finales.js';
import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PERIODES = [[182, L('6 mois', '6 months')], [365, L('1 an', '1 year')], [0, L('Tout', 'All')]];
const signe = (d) => (d == null ? '—' : `${d > 0 ? '▲ +' : d < 0 ? '▼ −' : '= '}${Math.abs(d)}`);
const cls = (d) => (d == null || d === 0 ? '' : d > 0 ? 'ok-text' : 'error-text');

export class ProgressionPage {
  constructor({ el, client }) {
    this.el = el;
    this.client = client;
    this.periode = 182;
    this.lichess = null; // { etat, series, erreur }
    this.chesscom = null;
  }

  pseudos() {
    try { const p = JSON.parse(localStorage.getItem('coach-echecs:mes-parties') || '{}'); return { lichess: (p.lichess || '').trim(), chesscom: (p.chesscom || '').trim() }; } catch { return { lichess: '', chesscom: '' }; }
  }

  show() {
    const { lichess, chesscom } = this.pseudos();
    if (lichess && this.lichess?.pseudo !== lichess) this.chargerLichess(lichess);
    if (chesscom && this.chesscom?.pseudo !== chesscom) this.chargerChessCom(chesscom);
    this.render();
  }

  async chargerLichess(pseudo) {
    this.lichess = { pseudo, etat: 'chargement' };
    try {
      const r = await this.client.queue.run(`https://lichess.org/api/user/${encodeURIComponent(pseudo)}/rating-history`, { headers: { accept: 'application/json' } });
      if (!r.res.ok) throw new Error(r.res.status === 404 ? L('compte introuvable', 'account not found') : L(`erreur ${r.res.status}`, `error ${r.res.status}`));
      this.lichess = { pseudo, etat: 'ok', series: seriesLichess(await r.res.json()) };
    } catch (e) {
      this.lichess = { pseudo, etat: 'erreur', erreur: e.message };
    }
    this.render();
  }

  async chargerChessCom(pseudo) {
    this.chesscom = { pseudo, etat: 'chargement' };
    try {
      const r = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(pseudo.toLowerCase())}/stats`);
      if (!r.ok) throw new Error(r.status === 404 ? L('compte introuvable', 'account not found') : L(`erreur ${r.status}`, `error ${r.status}`));
      this.chesscom = { pseudo, etat: 'ok', stats: statsChessCom(await r.json()) };
    } catch (e) {
      this.chesscom = { pseudo, etat: 'erreur', erreur: /fetch|network/i.test(e.message) ? L('Chess.com injoignable', 'Chess.com unreachable') : e.message };
    }
    this.render();
  }

  courbe(serie) {
    const lim = this.periode ? Date.now() - this.periode * 86400000 : 0;
    const pts = serie.points.filter((p) => p.t >= lim);
    if (pts.length < 2) return `<p class="muted tiny">${L('Pas assez de parties sur la période pour tracer une courbe.', 'Not enough games in this period to draw a curve.')}</p>`;
    const rs = pts.map((p) => p.r);
    return `<svg class="prog-courbe" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="${L(`Évolution du classement ${esc(serie.nom)}`, `${esc(serie.nom)} rating history`)}"><path d="${cheminCourbe(pts)}" /></svg>
      <p class="muted tiny prog-bornes"><span>${new Date(pts[0].t).toLocaleDateString(L('fr-FR', 'en-GB'), { month: 'short', year: 'numeric' })} · ${pts[0].r}</span><span>min ${Math.min(...rs)} · max ${Math.max(...rs)}</span><span>${pts.at(-1).r}</span></p>`;
  }

  carteSerie(s) {
    return `<div class="prog-serie"><h4>${esc(s.nom)} <span class="prog-actuel">${s.actuel ?? '—'}</span></h4>
      <p class="small">${L('30 jours :', '30 days:')} <strong class="${cls(s.d30)}">${signe(s.d30)}</strong> · ${L('90 jours :', '90 days:')} <strong class="${cls(s.d90)}">${signe(s.d90)}</strong>${s.max ? ` · ${L('record', 'peak')} ${s.max}` : ''}</p>
      ${this.courbe(s)}</div>`;
  }

  lichessHtml() {
    const { lichess: pseudo } = this.pseudos();
    if (!pseudo) return L('<p class="small muted">Indique ton pseudo Lichess (ou connecte-toi) dans <a href="#/parties">Mes parties</a> pour voir ta courbe.</p>', '<p class="small muted">Enter your Lichess username (or log in) in <a href="#/parties">My games</a> to see your curve.</p>');
    const l = this.lichess;
    if (!l || l.etat === 'chargement') return `<p class="state small"><span class="spinner"></span> ${L('Chargement de ton historique Lichess…', 'Loading your Lichess history…')}</p>`;
    if (l.etat === 'erreur') return `<p class="small error-text">${L('Lichess :', 'Lichess:')} ${esc(l.erreur)}.</p>`;
    if (!l.series.length) return `<p class="small muted">${L('Aucune partie classée sur ce compte.', 'No rated games on this account.')}</p>`;
    return l.series.slice(0, 3).map((s) => this.carteSerie(s)).join('');
  }

  chessComHtml() {
    const { chesscom: pseudo } = this.pseudos();
    if (!pseudo) return L('<p class="small muted">Indique ton pseudo Chess.com dans <a href="#/parties">Mes parties</a>.</p>', '<p class="small muted">Enter your Chess.com username in <a href="#/parties">My games</a>.</p>');
    const c = this.chesscom;
    const series = seriesParties(chargerClassements(), 'Chess.com');
    const stats = c?.etat === 'ok' && c.stats.length
      ? `<ul class="prog-stats">${c.stats.map((s) => `<li><strong>${esc(s.nom)}</strong> : ${s.actuel}${s.max ? ` <span class="muted">(${L('record', 'peak')} ${s.max})</span>` : ''}${s.bilan ? ` <span class="muted tiny">· ${L(`${s.bilan.v} V / ${s.bilan.n} N / ${s.bilan.d} D`, `${s.bilan.v} W / ${s.bilan.n} D / ${s.bilan.d} L`)}</span>` : ''}</li>`).join('')}</ul>`
      : c?.etat === 'erreur' ? `<p class="small error-text">${L('Chess.com :', 'Chess.com:')} ${esc(c.erreur)}.</p>` : `<p class="state small"><span class="spinner"></span> ${L('Chargement…', 'Loading…')}</p>`;
    const courbes = series.length
      ? series.slice(0, 2).map((s) => this.carteSerie(s)).join('')
      : `<p class="muted tiny">${L('Chess.com ne donne pas l’historique de ton classement : la courbe se construit avec les parties que tu charges dans Mes parties.', 'Chess.com doesn’t provide your rating history: the curve is built from the games you load in My games.')}</p>`;
    return `${stats}${courbes}`;
  }

  routineHtml() {
    const data = chargerRoutine();
    const profil = profilDe(data);
    const sem = routineParSemaine(data.jours, (d) => blocsDuJour(d, profil).blocs.length, jour());
    const t = (champ, plus, nom) => {
      const v = tendance(sem, champ, plus);
      return v ? `<li>${nom} : <strong class="${v === 'mieux' ? 'ok-text' : v === 'moins bien' ? 'error-text' : ''}">${v === 'mieux' ? L('↗ en progrès', '↗ improving') : v === 'moins bien' ? L('↘ en baisse', '↘ declining') : L('→ stable', '→ stable')}</strong></li>` : '';
    };
    const v = (x) => (x == null ? '—' : String(x).replace('.', ','));
    const tendances = [t('problemes', true, L('Problèmes réussis', 'Puzzles solved')), t('menaces', false, L('Menaces ratées', 'Missed threats')), t('temps', false, L('Blitz perdus au temps', 'Blitz games lost on time'))].join('');
    return `<table class="routine-table prog-table"><thead><tr><th>${L('Semaine', 'Week')}</th><th>${L('Jours actifs', 'Active days')}</th><th>${L('Complets', 'Complete')}</th><th>${L('Problèmes /10', 'Puzzles /10')}</th><th>${L('Menaces ratées', 'Missed threats')}</th><th>${L('Au temps', 'On time')}</th></tr></thead>
      <tbody>${sem.map((s, i) => `<tr><td>${i === sem.length - 1 ? L('Cette semaine', 'This week') : L(`Il y a ${sem.length - 1 - i} sem.`, `${sem.length - 1 - i} wk ago`)}</td><td>${s.actifs}/7</td><td>${s.complets}</td><td>${v(s.problemes)}</td><td>${v(s.menaces)}</td><td>${v(s.temps)}</td></tr>`).join('')}</tbody></table>
      ${tendances ? `<ul class="small">${tendances}</ul>` : `<p class="muted tiny">${L('Remplis tes chiffres du soir dans la routine : les tendances apparaîtront ici.', 'Fill in your evening numbers in the routine: trends will appear here.')}</p>`}`;
  }

  entrainementHtml() {
    const p = loadProgress();
    const f = chargerFinales();
    const apprises = Object.keys(p.cours || {}).length;
    const finales = FINALES.filter((x) => f[x.id]?.ok).length;
    const corrigees = (p.sorties || []).filter((x) => x.corrige).length;
    const aCorriger = vraiesErreurs(p).length;
    return `<div class="prog-chiffres">
      <div><span class="hub-big">${apprises}</span><span class="muted small">${L('variante(s) apprise(s)', 'line(s) learned')}</span></div>
      <div><span class="hub-big">${finales}/${FINALES.length}</span><span class="muted small">${L('finales réussies', 'endgames passed')}</span></div>
      <div><span class="hub-big">${corrigees}</span><span class="muted small">${L('position(s) de mes parties corrigée(s)', 'position(s) from my games fixed')}${aCorriger ? ` · ${aCorriger} ${L('à faire', 'to do')}` : ''}</span></div>
    </div>`;
  }

  render() {
    this.el.innerHTML = `<div class="progression">
      <section class="card"><h2>📈 ${L('Ma progression', 'My progress')}</h2>
        <p class="small muted">${L('Tes classements, ta routine et ton entraînement au même endroit. Chiffres tirés de Lichess, de Chess.com et de ce que tu as fait dans l’appli : rien n’est estimé.', 'Your ratings, your routine and your training in one place. Figures taken from Lichess, Chess.com and what you did in the app: nothing is estimated.')}</p>
        <div class="chips" role="group" aria-label="${L('Période des courbes', 'Curve period')}">${PERIODES.map(([k, l]) => `<button type="button" class="chip" data-periode="${k}" aria-pressed="${String(Number(k) === this.periode)}">${l}</button>`).join('')}</div>
      </section>
      <section class="card" data-prog-lichess><h3>Lichess${this.pseudos().lichess ? ` · ${esc(this.pseudos().lichess)}` : ''}</h3>${this.lichessHtml()}</section>
      <section class="card" data-prog-chesscom><h3>Chess.com${this.pseudos().chesscom ? ` · ${esc(this.pseudos().chesscom)}` : ''}</h3>${this.chessComHtml()}</section>
      <section class="card" data-prog-routine><h3>📅 ${L('Ma routine (4 dernières semaines)', 'My routine (last 4 weeks)')}</h3>${this.routineHtml()}</section>
      <section class="card" data-prog-entrainement><h3>🎯 ${L('Mon entraînement', 'My training')}</h3>${this.entrainementHtml()}</section>
    </div>`;
    this.el.querySelectorAll('[data-periode]').forEach((b) => b.addEventListener('click', () => { this.periode = Number(b.dataset.periode); this.render(); }));
  }
}

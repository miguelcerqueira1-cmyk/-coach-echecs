// Page « Ma progression » (#/progression) : classements Lichess (historique public) et Chess.com
// (classement actuel + parties importées), routine sur 4 semaines, chiffres de l'entraînement.
import {
  seriesLichess, seriesParties, statsChessCom, chargerClassements, routineParSemaine, tendance, cheminCourbe,
} from './progression-core.js';
import { charger as chargerRoutine, blocsDuJour, profilDe, jour } from './routine-core.js';
import { loadProgress, vraiesErreurs } from './progress.js';
import { chargerFinales } from './finales.js';
import FINALES from '../data/finales.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PERIODES = [[182, '6 mois'], [365, '1 an'], [0, 'Tout']];
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
      if (!r.res.ok) throw new Error(r.res.status === 404 ? 'compte introuvable' : `erreur ${r.res.status}`);
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
      if (!r.ok) throw new Error(r.status === 404 ? 'compte introuvable' : `erreur ${r.status}`);
      this.chesscom = { pseudo, etat: 'ok', stats: statsChessCom(await r.json()) };
    } catch (e) {
      this.chesscom = { pseudo, etat: 'erreur', erreur: /fetch|network/i.test(e.message) ? 'Chess.com injoignable' : e.message };
    }
    this.render();
  }

  courbe(serie) {
    const lim = this.periode ? Date.now() - this.periode * 86400000 : 0;
    const pts = serie.points.filter((p) => p.t >= lim);
    if (pts.length < 2) return '<p class="muted tiny">Pas assez de parties sur la période pour tracer une courbe.</p>';
    const rs = pts.map((p) => p.r);
    return `<svg class="prog-courbe" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="Évolution du classement ${esc(serie.nom)}"><path d="${cheminCourbe(pts)}" /></svg>
      <p class="muted tiny prog-bornes"><span>${new Date(pts[0].t).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} · ${pts[0].r}</span><span>min ${Math.min(...rs)} · max ${Math.max(...rs)}</span><span>${pts.at(-1).r}</span></p>`;
  }

  carteSerie(s) {
    return `<div class="prog-serie"><h4>${esc(s.nom)} <span class="prog-actuel">${s.actuel ?? '—'}</span></h4>
      <p class="small">30 jours : <strong class="${cls(s.d30)}">${signe(s.d30)}</strong> · 90 jours : <strong class="${cls(s.d90)}">${signe(s.d90)}</strong>${s.max ? ` · record ${s.max}` : ''}</p>
      ${this.courbe(s)}</div>`;
  }

  lichessHtml() {
    const { lichess: pseudo } = this.pseudos();
    if (!pseudo) return '<p class="small muted">Indique ton pseudo Lichess (ou connecte-toi) dans <a href="#/parties">Mes parties</a> pour voir ta courbe.</p>';
    const l = this.lichess;
    if (!l || l.etat === 'chargement') return '<p class="state small"><span class="spinner"></span> Chargement de ton historique Lichess…</p>';
    if (l.etat === 'erreur') return `<p class="small error-text">Lichess : ${esc(l.erreur)}.</p>`;
    if (!l.series.length) return '<p class="small muted">Aucune partie classée sur ce compte.</p>';
    return l.series.slice(0, 3).map((s) => this.carteSerie(s)).join('');
  }

  chessComHtml() {
    const { chesscom: pseudo } = this.pseudos();
    if (!pseudo) return '<p class="small muted">Indique ton pseudo Chess.com dans <a href="#/parties">Mes parties</a>.</p>';
    const c = this.chesscom;
    const series = seriesParties(chargerClassements(), 'Chess.com');
    const stats = c?.etat === 'ok' && c.stats.length
      ? `<ul class="prog-stats">${c.stats.map((s) => `<li><strong>${esc(s.nom)}</strong> : ${s.actuel}${s.max ? ` <span class="muted">(record ${s.max})</span>` : ''}${s.bilan ? ` <span class="muted tiny">· ${s.bilan.v} V / ${s.bilan.n} N / ${s.bilan.d} D</span>` : ''}</li>`).join('')}</ul>`
      : c?.etat === 'erreur' ? `<p class="small error-text">Chess.com : ${esc(c.erreur)}.</p>` : '<p class="state small"><span class="spinner"></span> Chargement…</p>';
    const courbes = series.length
      ? series.slice(0, 2).map((s) => this.carteSerie(s)).join('')
      : '<p class="muted tiny">Chess.com ne donne pas l’historique de ton classement : la courbe se construit avec les parties que tu charges dans Mes parties.</p>';
    return `${stats}${courbes}`;
  }

  routineHtml() {
    const data = chargerRoutine();
    const profil = profilDe(data);
    const sem = routineParSemaine(data.jours, (d) => blocsDuJour(d, profil).blocs.length, jour());
    const t = (champ, plus, nom) => {
      const v = tendance(sem, champ, plus);
      return v ? `<li>${nom} : <strong class="${v === 'mieux' ? 'ok-text' : v === 'moins bien' ? 'error-text' : ''}">${v === 'mieux' ? '↗ en progrès' : v === 'moins bien' ? '↘ en baisse' : '→ stable'}</strong></li>` : '';
    };
    const v = (x) => (x == null ? '—' : String(x).replace('.', ','));
    const tendances = [t('problemes', true, 'Problèmes réussis'), t('menaces', false, 'Menaces ratées'), t('temps', false, 'Blitz perdus au temps')].join('');
    return `<table class="routine-table prog-table"><thead><tr><th>Semaine</th><th>Jours actifs</th><th>Complets</th><th>Problèmes /10</th><th>Menaces ratées</th><th>Au temps</th></tr></thead>
      <tbody>${sem.map((s, i) => `<tr><td>${i === sem.length - 1 ? 'Cette semaine' : `Il y a ${sem.length - 1 - i} sem.`}</td><td>${s.actifs}/7</td><td>${s.complets}</td><td>${v(s.problemes)}</td><td>${v(s.menaces)}</td><td>${v(s.temps)}</td></tr>`).join('')}</tbody></table>
      ${tendances ? `<ul class="small">${tendances}</ul>` : '<p class="muted tiny">Remplis tes chiffres du soir dans la routine : les tendances apparaîtront ici.</p>'}`;
  }

  entrainementHtml() {
    const p = loadProgress();
    const f = chargerFinales();
    const apprises = Object.keys(p.cours || {}).length;
    const finales = FINALES.filter((x) => f[x.id]?.ok).length;
    const corrigees = (p.sorties || []).filter((x) => x.corrige).length;
    const aCorriger = vraiesErreurs(p).length;
    return `<div class="prog-chiffres">
      <div><span class="hub-big">${apprises}</span><span class="muted small">variante(s) apprise(s)</span></div>
      <div><span class="hub-big">${finales}/${FINALES.length}</span><span class="muted small">finales réussies</span></div>
      <div><span class="hub-big">${corrigees}</span><span class="muted small">position(s) de mes parties corrigée(s)${aCorriger ? ` · ${aCorriger} à faire` : ''}</span></div>
    </div>`;
  }

  render() {
    this.el.innerHTML = `<div class="progression">
      <section class="card"><h2>📈 Ma progression</h2>
        <p class="small muted">Tes classements, ta routine et ton entraînement au même endroit. Chiffres tirés de Lichess, de Chess.com et de ce que tu as fait dans l’appli : rien n’est estimé.</p>
        <div class="chips" role="group" aria-label="Période des courbes">${PERIODES.map(([k, l]) => `<button type="button" class="chip" data-periode="${k}" aria-pressed="${String(Number(k) === this.periode)}">${l}</button>`).join('')}</div>
      </section>
      <section class="card" data-prog-lichess><h3>Lichess${this.pseudos().lichess ? ` · ${esc(this.pseudos().lichess)}` : ''}</h3>${this.lichessHtml()}</section>
      <section class="card" data-prog-chesscom><h3>Chess.com${this.pseudos().chesscom ? ` · ${esc(this.pseudos().chesscom)}` : ''}</h3>${this.chessComHtml()}</section>
      <section class="card" data-prog-routine><h3>📅 Ma routine (4 dernières semaines)</h3>${this.routineHtml()}</section>
      <section class="card" data-prog-entrainement><h3>🎯 Mon entraînement</h3>${this.entrainementHtml()}</section>
    </div>`;
    this.el.querySelectorAll('[data-periode]').forEach((b) => b.addEventListener('click', () => { this.periode = Number(b.dataset.periode); this.render(); }));
  }
}

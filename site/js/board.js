// Échiquier DOM : clic ou glisser-déposer, flèches SVG, choix explicite de promotion.
// Il n'applique aucune règle lui-même : la liste des coups légaux vient de chess.js.

const FILES = 'abcdefgh';
const PROMO = ['q', 'r', 'b', 'n'];
const PROMO_NAMES = { q: 'Dame', r: 'Tour', b: 'Fou', n: 'Cavalier' };

export class Board {
  constructor(el, { piecesUrl = './pieces/', onMove = () => {} } = {}) {
    this.el = el;
    this.piecesUrl = piecesUrl;
    this.onMove = onMove;
    this.orientation = 'w';
    this.position = null; // résultat de chess.board()
    this.legal = [];
    this.interactive = false;
    this.selected = null;
    this.arrows = [];
    this.lastMove = null;
    this.checkSquare = null;
    this.drag = null;
    this._build();
  }

  _build() {
    this.el.classList.add('board');
    this.el.innerHTML = '';
    this.grid = document.createElement('div');
    this.grid.className = 'board-grid';
    this.squares = {};
    for (let i = 0; i < 64; i++) {
      const sq = document.createElement('div');
      sq.className = 'sq';
      this.grid.appendChild(sq);
    }
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'board-arrows');
    this.svg.setAttribute('viewBox', '0 0 800 800');
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.innerHTML = `<defs>
      ${['best', 'reply', 'threat', 'stat', 'alt'].map((k) => `<marker id="ah-${k}" markerWidth="4" markerHeight="4" refX="2.2" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" class="ah-${k}"/></marker>`).join('')}
    </defs><g class="arrows"></g>`;
    this.promo = document.createElement('div');
    this.promo.className = 'promo hidden';
    this.el.append(this.grid, this.svg, this.promo);
    this.grid.addEventListener('pointerdown', (e) => this._pointerDown(e));
    window.addEventListener('pointermove', (e) => this._pointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this._pointerUp(e));
    window.addEventListener('pointercancel', () => this._cancelDrag());
    this._layout();
  }

  // Ordre des cases selon l'orientation.
  _layout() {
    const cells = this.grid.children;
    this.squares = {};
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8);
      const f = i % 8;
      const file = this.orientation === 'w' ? f : 7 - f;
      const rank = this.orientation === 'w' ? 7 - r : r;
      const name = FILES[file] + (rank + 1);
      const sq = cells[i];
      sq.dataset.sq = name;
      sq.className = 'sq ' + ((file + rank) % 2 ? 'light' : 'dark');
      sq.innerHTML = '';
      if (f === 0) sq.insertAdjacentHTML('beforeend', `<span class="coord rank">${rank + 1}</span>`);
      if (r === 7) sq.insertAdjacentHTML('beforeend', `<span class="coord file">${FILES[file]}</span>`);
      this.squares[name] = sq;
    }
  }

  setOrientation(color) {
    if (color === this.orientation) return;
    this.orientation = color;
    this._layout();
    this.render();
  }

  flip() { this.setOrientation(this.orientation === 'w' ? 'b' : 'w'); }

  // chess : instance chess.js de la position à afficher.
  setPosition(chess, { lastMove = null, interactive = false } = {}) {
    this.position = chess.board();
    this.turn = chess.turn();
    this.legal = interactive ? chess.moves({ verbose: true }) : [];
    this.interactive = interactive;
    this.lastMove = lastMove;
    this.checkSquare = null;
    if (chess.inCheck()) {
      for (const row of this.position) for (const p of row) if (p && p.type === 'k' && p.color === chess.turn()) this.checkSquare = p.square;
    }
    this.selected = null;
    this._hidePromo();
    this.render();
  }

  // Case entourée (indice de niveau 2 : pièce à jouer, sans dire où).
  setHint(square) {
    if (square === this.hint) return;
    this.hint = square;
    for (const [name, sq] of Object.entries(this.squares)) sq.classList.toggle('hint', name === square);
  }

  setArrows(arrows) {
    this.arrows = arrows || [];
    this._renderArrows();
  }

  render() {
    if (!this.position) return;
    const pieceAt = {};
    for (const row of this.position) for (const p of row) if (p) pieceAt[p.square] = p;
    const targets = new Set(this.selected ? this.legal.filter((m) => m.from === this.selected).map((m) => m.to) : []);
    for (const [name, sq] of Object.entries(this.squares)) {
      sq.classList.toggle('last', !!this.lastMove && (this.lastMove.from === name || this.lastMove.to === name));
      sq.classList.toggle('selected', this.selected === name);
      sq.classList.toggle('check', this.checkSquare === name);
      sq.classList.toggle('hint', this.hint === name);
      sq.classList.toggle('target', targets.has(name));
      sq.classList.toggle('capture', targets.has(name) && !!pieceAt[name]);
      let pc = sq.querySelector('.piece');
      const p = pieceAt[name];
      if (p) {
        const key = p.color + p.type.toUpperCase();
        if (!pc) {
          pc = document.createElement('div');
          pc.className = 'piece';
          sq.appendChild(pc);
        }
        if (pc.dataset.key !== key) {
          pc.dataset.key = key;
          pc.style.backgroundImage = `url(${this.piecesUrl}${key}.svg)`;
          pc.setAttribute('role', 'img');
          pc.setAttribute('aria-label', `${p.color === 'w' ? 'blanc' : 'noir'} ${p.type}`);
        }
        pc.classList.toggle('movable', this.interactive && p.color === this.turn);
      } else if (pc) {
        pc.remove();
      }
    }
    this._renderArrows();
  }

  _center(sq) {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    const x = this.orientation === 'w' ? f : 7 - f;
    const y = this.orientation === 'w' ? 7 - r : r;
    return [x * 100 + 50, y * 100 + 50];
  }

  _renderArrows() {
    const g = this.svg.querySelector('.arrows');
    g.innerHTML = '';
    for (const a of this.arrows) {
      const [x1, y1] = this._center(a.from);
      const [x2, y2] = this._center(a.to);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      const shorten = 32;
      const ex = x2 - (dx / len) * shorten;
      const ey = y2 - (dy / len) * shorten;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', ex); line.setAttribute('y2', ey);
      line.setAttribute('class', `arrow arrow-${a.kind}`);
      line.setAttribute('marker-end', `url(#ah-${a.kind})`);
      g.appendChild(line);
    }
  }

  // ---------- Saisie ----------

  _squareFromPoint(x, y) {
    const rect = this.grid.getBoundingClientRect();
    if (x < rect.left || y < rect.top || x >= rect.right || y >= rect.bottom) return null;
    const f = Math.floor(((x - rect.left) / rect.width) * 8);
    const r = Math.floor(((y - rect.top) / rect.height) * 8);
    const file = this.orientation === 'w' ? f : 7 - f;
    const rank = this.orientation === 'w' ? 7 - r : r;
    return FILES[file] + (rank + 1);
  }

  _canPick(sq) { return this.interactive && this.legal.some((m) => m.from === sq); }

  _pointerDown(e) {
    if (!this.interactive || !this.promo.classList.contains('hidden')) return;
    if (e.button !== undefined && e.button !== 0) return;
    const sq = this._squareFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    if (this.selected && this.selected !== sq && this.legal.some((m) => m.from === this.selected && m.to === sq)) {
      e.preventDefault();
      this._attempt(this.selected, sq);
      return;
    }
    if (this._canPick(sq)) {
      e.preventDefault();
      this.selected = sq;
      this.render();
      const pc = this.squares[sq].querySelector('.piece');
      if (pc) {
        const rect = pc.getBoundingClientRect();
        this.drag = { from: sq, el: pc, startX: e.clientX, startY: e.clientY, size: rect.width, moved: false, wasSelected: this.selected === sq };
      }
    } else {
      this.selected = null;
      this.render();
    }
  }

  _pointerMove(e) {
    const d = this.drag;
    if (!d) return;
    const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
    if (!d.moved && dist < 6) return;
    e.preventDefault();
    if (!d.moved) {
      d.moved = true;
      d.ghost = d.el.cloneNode(true);
      d.ghost.classList.add('ghost');
      d.ghost.style.width = d.ghost.style.height = d.size + 'px';
      document.body.appendChild(d.ghost);
      d.el.classList.add('dragging');
    }
    d.ghost.style.transform = `translate(${e.clientX - d.size / 2}px, ${e.clientY - d.size / 2}px)`;
    const over = this._squareFromPoint(e.clientX, e.clientY);
    for (const s of Object.values(this.squares)) s.classList.remove('hover');
    if (over) this.squares[over].classList.add('hover');
  }

  _pointerUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    for (const s of Object.values(this.squares)) s.classList.remove('hover');
    if (d.ghost) d.ghost.remove();
    d.el.classList.remove('dragging');
    if (!d.moved) return; // simple clic : la pièce reste sélectionnée
    const to = this._squareFromPoint(e.clientX, e.clientY);
    if (to && to !== d.from && this.legal.some((m) => m.from === d.from && m.to === to)) this._attempt(d.from, to);
  }

  _cancelDrag() {
    if (this.drag?.ghost) this.drag.ghost.remove();
    this.drag?.el.classList.remove('dragging');
    this.drag = null;
  }

  async _attempt(from, to) {
    const cands = this.legal.filter((m) => m.from === from && m.to === to);
    if (!cands.length) return;
    let promotion;
    if (cands.some((m) => m.promotion)) {
      promotion = await this._askPromotion(to, cands[0].color);
      if (!promotion) { this.selected = null; this.render(); return; }
    }
    this.selected = null;
    this.onMove({ from, to, promotion });
  }

  _askPromotion(to, color) {
    return new Promise((resolve) => {
      this.promo.innerHTML = `<div class="promo-box" role="dialog" aria-label="Choix de la promotion">
        <p>Promotion en ${to} :</p>
        <div class="promo-choices">${PROMO.map((p) => `<button type="button" data-p="${p}" title="${PROMO_NAMES[p]}"><span class="piece" style="background-image:url(${this.piecesUrl}${color}${p.toUpperCase()}.svg)"></span><span>${PROMO_NAMES[p]}</span></button>`).join('')}</div>
        <button type="button" class="promo-cancel">Annuler</button></div>`;
      this.promo.classList.remove('hidden');
      this.promo.onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        this._hidePromo();
        resolve(b.dataset.p || null);
      };
    });
  }

  _hidePromo() {
    this.promo.classList.add('hidden');
    this.promo.innerHTML = '';
    this.promo.onclick = null;
  }
}

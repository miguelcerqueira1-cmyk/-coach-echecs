# CLAUDE.md — Coach Échecs

Entraîneur d'échecs web en français. Principe non négociable :
**Stockfish calcule, chess.js valide, Claude explique.** Aucune évaluation, variante,
mat ou pourcentage ne doit venir du modèle de langage.

## Architecture

```
site/                      Site statique servi par GitHub Pages (aucune étape de compilation)
  index.html, css/app.css
  js/main.js               Contrôleur : cycle coup → calcul → conseil → explication
  js/game.js               Modèle de partie = source de vérité (rejeu, règles de fin, PGN/FEN, jetons)
  js/engine.js             Client UCI : Web Worker, file d'un calcul, annulation, chien de garde
  js/analysis.js           Validation des variantes, points de vue des scores, descriptions FR
  js/board.js              Échiquier DOM (clic, glisser, flèches SVG, choix de promotion)
  js/coach.js              Client de l'API Claude + vérification des coups cités
  js/storage.js            localStorage (partie, sauvegarde précédente, réglages, code d'accès)
  pieces/                  SVG cburnett (GPLv2+)
  vendor/, engine/         GÉNÉRÉS par scripts/vendor.mjs (postinstall), non versionnés
worker/                    API Cloudflare Worker (Claude) : src/index.js, src/prompt.js
scripts/                   vendor.mjs, build.mjs (→ dist/ + config.json), serve.mjs
tests/unit/                node:test (règles, continuité, import/export)
tests/e2e/                 Playwright, vrai Stockfish ; API Claude simulée par interception
.github/workflows/deploy.yml  vérif → Worker → Pages → test du site publié
```

Trois mondes distincts :
1. **Développement/déploiement** : GitHub Actions (aucun serveur permanent).
2. **Calcul** : Stockfish WASM dans le navigateur de l'utilisateur.
3. **Explications** : Cloudflare Worker → API Anthropic (clé uniquement dans les secrets du Worker).

## Commandes de vérification

```
npm ci                 # installe et copie chess.js / Stockfish dans site/
npm test               # tests unitaires
npm run build          # dist/ (COACH_API_URL=... pour l'adresse de l'API)
npx playwright test    # bout en bout (sert dist/ sous /coach-echecs/) ; WITH_WEBKIT=1 en CI
BASE_URL=https://…/coach-echecs/ npx playwright test -g "parcours complet"   # site publié
cd worker && npm ci && npm test   # Worker + faux serveur Anthropic (wrangler dev)
cd worker && npm run check        # wrangler deploy --dry-run
```

## Décisions

- **Stockfish 18 « lite » monothread** (stockfish.js 18.0.8, WASM 7,3 Mo, réseau NNUE réduit
  intégré). Pleine force : aucun `Skill Level`/`UCI_LimitStrength`. La version complète
  (wasm 113 Mo) dépasse la limite de 100 Mo par fichier de GitHub : non proposée.
  Multithread non activé (GitHub Pages n'envoie pas COOP/COEP ; coi-serviceworker non testé
  sur Safari iOS publié). Évolution possible : moteur natif sur un serveur (hors GitHub Pages).
- Le WASM est téléchargé par la page (progression réelle), conservé dans Cache Storage
  (clé = hash du WASM), puis passé au Worker via `stockfish.js#<blob-url>`. Pas de service worker.
- `position startpos|fen … moves …` : l'historique complet est toujours transmis au moteur.
- **Jetons** `{gameId, branchId, revision, ply}` : `revision` croît à chaque modification
  (coup, annulation, import) ; toute réponse moteur/Claude dont le jeton n'est plus courant
  est ignorée. Une comparaison de FEN ne suffit pas (annuler puis rejouer = même FEN).
- `record.moves` = coups réellement joués ; `record.analysisBranches` réservé aux variantes
  d'analyse (Phase 2). Un conseil n'est enregistré qu'après « Confirmer ».
- Fins de partie : chess.js compte triple répétition et 50 coups dans `isGameOver()` ; ici ce
  sont des **nulles réclamables** (la partie continue). Fins automatiques : mat, pat,
  matériel insuffisant (cas reconnus par chess.js, pas toutes les positions mortes),
  quintuple répétition, 75 coups. Import FEN : historique antérieur signalé inconnu.
- Scores UCI (camp au trait) convertis au point de vue des Blancs ; mats traités à part ;
  WDL affiché seulement s'il est fourni (`UCI_ShowWDL`), avec avertissement de portée.
- Menace = analyse « coup nul » courte (800 ms), seulement si le camp au trait n'est pas en échec.
- Claude cite les coups entre crochets ; le client marque ceux absents des variantes
  calculées (⚠) ou seulement légaux (non évalués).
- Worker : code d'accès (SHA-256 + `timingSafeEqual`), verrouillage 10 échecs/h/IP et 30/h,
  8 appels/min, plafond quotidien (`DAILY_LIMIT`), CORS limité à l'origine Pages, corps ≤ 16 Ko,
  compteurs dans un Durable Object SQLite (offre gratuite). Modèle par défaut
  `claude-opus-5-5`, effort `low`, `fallbacks: "default"` (bêta `server-side-fallback-2026-07-01`).
- Sans API ou sans code : tout fonctionne sauf l'explication, indiquée comme indisponible.

## Phase 2 (non implémenté)

- Modes « indice » → « explication » → « montrer le coup », en plus du conseil direct.
- Bilan de fin de partie : moments décisifs, erreurs principales, trois pistes de travail.
- Comparaison facultative de trois candidats (MultiPV 3), avec indication du coût de calcul.
- Exploration de variantes d'analyse (`analysisBranches`) séparée de la partie réelle ;
  analyse d'une position passée de l'historique.
- Base pédagogique sourcée (règles officielles FIDE, ouvertures, tactique, stratégie,
  structures de pions, finales) consultable par Claude ; base de parties annotées ;
  tables de finales compatibles. Ne pas entraîner de modèle d'échecs.
- Option multithread (coi-serviceworker) seulement après test réussi sur le site publié,
  Safari iOS compris, avec repli automatique monothread.
- Réclamation explicite d'une nulle / abandon dans l'interface.
- Mode hors ligne (service worker) pour l'interface.

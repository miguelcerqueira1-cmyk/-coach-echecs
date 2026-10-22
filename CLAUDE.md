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
  js/hints.js              Mode « Indice d'abord » : indices progressifs tirés du coup calculé
  js/training-core.js      Entraînement : arbre des fiches, tirage pondéré, verdicts (pur, testé)
  js/training.js           Page Entraînement (adversaire tiré de Lichess ou des fiches, jugé par Stockfish)
  js/games-core.js         Mes parties : formats Lichess/Chess.com, sortie de répertoire, erreurs, bilan (pur)
  js/games.js              Page Mes parties (import, analyse Stockfish coup par coup, bilan, revue)
  js/explain-free.js       Explication gratuite sans IA (faits chess.js + calculs Stockfish), utilisée quand Claude n'est pas configuré
  js/storage.js            localStorage (partie, sauvegarde précédente, réglages, code d'accès, jeton Lichess, clé YouTube)
  js/router.js             Navigation #/moteur ↔ #/repertoire (sans rechargement)
  js/lichess.js            Cloud Eval + Opening Explorer : file série, pause 60 s sur 429, cache, %
  js/optimal.js            Panneau « Coup optimal » (Stockfish local / Cloud Eval / meilleur % filtré)
  js/repertoire-page.js    Page Répertoire : filtres, recherche par coup/ECO, tableau 9 colonnes, Anti-trash,
                           « Tester cette ligne », arbre Lichess (niveau/maîtres), vidéos, export PGN
  js/repertoire-pgn.js     Export PGN du répertoire (variantes, $2, commentaires ; relu par chess.js en test)
  js/youtube.js            Recherche YouTube Data v3 par fiche et par langue (clé perso, cache 7 j)
  js/lines.js              Lecture des lignes « 1. d4 d5 2. c4? », index ECO, empreintes
  data/repertoire.js       58 fiches rédigées (Gambit Dame, Caro-Kann) — source à éditer
  data/repertoire.json     GÉNÉRÉ (scripts/repertoire.mjs) : fiches + ECO + vérification
  pieces/                  SVG cburnett (GPLv2+)
  vendor/, engine/         GÉNÉRÉS par scripts/vendor.mjs (postinstall), non versionnés
worker/                    API Cloudflare Worker (Claude) : src/index.js, src/prompt.js
scripts/                   vendor.mjs, build.mjs (→ dist/ + config.json), serve.mjs,
                           repertoire.mjs (ECO + JSON), verify-repertoire.mjs + uci-node.mjs (Stockfish Node)
data/chess-openings/       Base ECO CC0 de lichess-org/chess-openings (TSV)
data/verification.json     Résultats Stockfish (profondeur 18) des punitions/pièges, par empreinte de fiche
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
npm run verify:repertoire         # après modification d'une fiche : recalcule data/verification.json
node scripts/verify-repertoire.mjs --all --dry   # CI : tout recalculer sans écrire
```

Modifier le répertoire : éditer `site/data/repertoire.js` (coups en SAN anglaise, « ? » sur le
coup fautif des punitions/pièges), puis `npm run verify:repertoire`. Une fiche dont la
vérification n'est pas confirmée fait échouer les tests : corriger la ligne (le script affiche
la suite proposée par le moteur) plutôt que baisser le seuil.

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
- Sans API ou sans code : « Expliquer » produit une explication gratuite construite uniquement
  à partir des calculs (coup conseillé, variante, menace « coup nul », pièces en prise, roque,
  développement) ; aucune interprétation stratégique n'y est inventée.
- Téléphone : la liste des coups défile en interne (jamais la page) ; navigation ⏮ ◀ ▶ ⏭ et
  explication placées sous l'échiquier.
- **Lichess** (vérifié dans la spécification officielle lichess-org/api, oct. 2026) :
  Cloud Eval est public (`security: []`, CORS `*`, 404 si position absente du cache).
  L'Opening Explorer est sur `explorer.lichess.org` (plus `.ovh`) et exige un jeton OAuth2 :
  jeton personnel sans permission (stocké sur l'appareil) ou relais Worker `/v1/explorer`
  (secret `LICHESS_TOKEN`, cache 24 h, 60 req/min). CORS vérifié le 2026-10-22 : le preflight
  de l'explorateur renvoie `access-control-allow-origin: *` et autorise `Authorization` ; les 401
  (explorateur) et 404 (Cloud Eval) portent aussi les en-têtes CORS. Le mode « jeton sur
  l'appareil » fonctionne donc directement depuis GitHub Pages ; le relais reste une option.
  Une requête Lichess à la fois, une minute de pause après un 429 (règles d'usage Lichess).
- **Chess.com** n'expose pas de statistiques d'ouvertures agrégées : seules les tranches de
  classement Lichess sont proposées, avec l'avertissement qu'elles ne correspondent pas à Chess.com.
- « Meilleur % de victoire » : seulement parmi les coups ayant au moins N parties (50 par défaut),
  toujours présenté comme une fréquence observée, distincte de l'évaluation moteur.
- Répertoire : codes ECO et noms attribués automatiquement (position la plus profonde reconnue
  dans la base CC0) ; il n'existe pas de nomenclature FIDE officielle des variantes.
  Plans/structures = texte rédigé (interprétation) ; punitions/pièges = lignes vérifiées par
  Stockfish (punition ≥ +1,5 par défaut, ou seuil plus bas explicite pour un gain de pion).
  Lors de l'écriture initiale, 16 lignes rédigées de mémoire ont été rejetées par le moteur et
  corrigées ou retirées : ne jamais ajouter une ligne tactique sans la vérifier.
- Vidéos : aucun lien horodaté n'est inventé. Chaque fiche propose une recherche YouTube ; un lien
  précis n'est publié que s'il est vérifié (`video.url` + `verifie: true`, contrôlé par les tests).
  L'utilisateur peut enregistrer son propre lien horodaté (stocké sur l'appareil). Bouton
  « Vidéos » : 7 langues (fr, en, es, de, it, pt, ru) ; avec une clé YouTube Data v3 personnelle
  (search = 100 unités sur 10 000/jour → ≈ 100 recherches/jour, réponses en cache 7 jours),
  liste titre/chaîne/durée/vues ; sans clé, lien de recherche. L'app ne « regarde » pas les vidéos.
- Base des maîtres (explorer.lichess.org/masters, jeton requis, relais Worker avec db=masters) :
  bloc « Maîtres » du Coup optimal, bascule niveau/maîtres du tableau et de l'arbre, colonne
  Statistiques ; parties de maîtres ouvrables (/masters/pgn/{id}, jeton personnel).
- « Tester cette ligne » : ouvre la séquence sur #/moteur et la rejoue (400 ms/coup) ; pas de
  confirmation si la partie en cours est vide ou est elle-même une ligne testée (Event « Test : … »).
- Export PGN : une partie par fiche (≤ 64 par répertoire = limite d'une étude Lichess) ;
  chess.js refuse un commentaire juste après « ( » ou « ) » : le writer l'évite.
- Pages : #/moteur, #/repertoire, #/entrainement, #/parties. Le moteur est partagé : une page
  peut interrompre le calcul d'une autre ; la page Moteur relance son calcul en revenant.
- Mode « Indice d'abord » (réglage helpMode) : indice (thème + pièce) → explication sans le coup
  (case de départ entourée) → coup montré ; flèches et « Coup optimal » masqués jusque-là.
- Entraînement : coups adverses tirés au hasard pondéré par les parties Lichess du filtre
  (sinon par les fiches) ; nos coups : « répertoire » si présents dans les fiches, sinon jugés
  par Stockfish (perte ≤ 0,4 bon, ≤ 1,2 imprécision, ≤ 3 erreur, au-delà gaffe) ; pièges signalés.
- Mes parties : export Lichess `/api/games/user/{pseudo}` (NDJSON). Depuis l'environnement de
  développement, cet export répond 404 sans jeton (même pour des comptes connus) : l'application
  envoie le jeton personnel s'il existe. Chess.com : API publique `pub/player/{pseudo}/games/…`
  (CORS non vérifié localement ; test @online en CI). Analyse : une position = un calcul de
  `precision` ms, évaluations bornées à ±10 pions, mises en cache (40 parties) ; erreurs classées
  par perte (≥ 0,5 imprécision, ≥ 1,2 erreur, ≥ 3 gaffe) ; bilan = règles factuelles (sortie de
  répertoire, pièce laissée en prise, gaffe adverse non exploitée, phase la plus coûteuse).
- Interface en mode sombre par défaut (`:root[data-theme="light"]` pour le clair).

## Phase 2 (non implémenté)

- Liens vidéo horodatés vérifiés pour chaque fiche (à choisir et contrôler à la main).
- Plus de fiches (le répertoire actuel couvre 58 lignes ; l'arbre Lichess couvre le reste).
- Parties d'un joueur précis (endpoint /player).

- Bilan de la partie jouée sur la page Moteur (aujourd'hui : via « Mes parties » ou Exporter).
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

# CLAUDE.md — Coach Échecs

Entraîneur d'échecs web en français. Principe non négociable :
**Stockfish calcule, chess.js valide, Claude explique.** Aucune évaluation, variante,
mat ou pourcentage ne doit venir du modèle de langage.

## Architecture

```
site/                      Site statique servi par GitHub Pages (aucune étape de compilation)
  index.html, css/app.css
  sw.js                    Service worker (hors connexion) ; BUILD et PRECACHE remplis par build.mjs
  manifest.webmanifest     Application installable (URLs relatives : portée /-coach-echecs/)
  icons/                   PNG versionnés, générés par scripts/icons.mjs (Playwright) depuis pieces/wN.svg
  js/pwa.js                Enregistrement du SW, bandeau « Nouvelle version disponible », aide à l'installation
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
  js/optimal.js            Panneau « Coup optimal » (Stockfish local / Cloud Eval / meilleur % filtré / maîtres / Élite)
  js/joueurs.js            Recherche par joueur : noms normalisés, index joueurs.json (pur, testé)
  js/joueurs-ui.js         Section « Parties de joueurs » de la recherche du Répertoire
  js/elite.js              Jeu « Élite » : chargement (branche donnees-elite puis data/elite.json), clé FEN,
                           lecture d'une position, « Nouvelles parties » (pur, testé)
  js/repertoire-page.js    Page Répertoire : filtres, recherche par coup/ECO, tableau 9 colonnes, Anti-trash,
                           « Tester cette ligne », arbre Lichess (niveau/maîtres), vidéos, export PGN
  js/repertoire-pgn.js     Export PGN du répertoire (variantes, $2, commentaires ; relu par chess.js en test)
  js/youtube.js            Recherche YouTube Data v3 par fiche et par langue (clé perso, cache 7 j)
  js/lines.js              Lecture des lignes « 1. d4 d5 2. c4? », index ECO, empreintes
  data/repertoire.js       58 fiches rédigées (Gambit Dame, Caro-Kann) — source à éditer
  data/repertoire.json     GÉNÉRÉ (scripts/repertoire.mjs) : fiches + ECO + vérification
  data/elite.json          GÉNÉRÉ (scripts/elite.mjs, réseau) : copie de secours embarquée par deploy.yml, non versionnée
  pieces/                  SVG cburnett (GPLv2+)
  vendor/, engine/         GÉNÉRÉS par scripts/vendor.mjs (postinstall), non versionnés
worker/                    API Cloudflare Worker (Claude) : src/index.js, src/prompt.js
scripts/                   vendor.mjs, build.mjs (→ dist/ + config.json), serve.mjs,
                           repertoire.mjs (ECO + JSON), verify-repertoire.mjs + uci-node.mjs (Stockfish Node),
                           elite.mjs (téléchargement) + elite-core.mjs (lecture, filtre, agrégation ; pur),
                           verify-videos.mjs (oEmbed YouTube des vidéos choisies ; CI seulement)
data/chess-openings/       Base ECO CC0 de lichess-org/chess-openings (TSV)
data/verification.json     Résultats Stockfish (profondeur 18) des punitions/pièges, par empreinte de fiche
tests/unit/                node:test (règles, continuité, import/export)
tests/e2e/                 Playwright, vrai Stockfish ; API Claude simulée par interception
tests/fixtures/elite/      Réponses enregistrées pour `elite.mjs --fixture` (Lichess réelles, Chess.com synthétiques)
.github/workflows/deploy.yml  vérif → Worker → Pages → test du site publié
.github/workflows/elite.yml   collecte Élite toutes les 30 min (incrémentale) + lundi (complète) → branche donnees-elite
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
node scripts/verify-videos.mjs    # réseau (youtube.com bloqué en dev) : liens vidéo morts/modifiés ; --strict → échec
node scripts/verify-repertoire.mjs --all --dry   # CI : tout recalculer sans écrire
npm run elite                     # réseau : site/data/elite.json (≈ 10 min pour Lichess ; options en tête du script)
node scripts/elite.mjs --state d/etat.json --out d/elite.json         # complet + état
node scripts/elite.mjs --incremental d/etat.json --out d/elite.json   # nouvelles parties seulement
node scripts/elite.mjs --fixture tests/fixtures/elite --top 2 --now 2026-10-22T12:00:00Z --out /tmp/elite.json   # hors ligne
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
  (clé = hash du WASM), puis passé au Worker via `stockfish.js#<blob-url>`.
- **Application installable / hors connexion** (`sw.js`, `pwa.js`) : pré-cache de tout dist/ sauf le
  WASM (déjà dans le cache du moteur, jamais dupliqué), elite.json/joueurs.json et la source du
  répertoire ; cache `coach-echecs-app-<build>-<empreinte du contenu>`, anciens caches supprimés à
  l'activation (le cache `coach-echecs-moteur-*` n'est jamais touché). Réseau d'abord pour la
  navigation, config.json et engine/manifest.json (délai 6 s puis cache) ; stale-while-revalidate
  pour le reste de la même origine ; aucune requête d'une autre origine (Lichess, raw.githubusercontent,
  Google Fonts, Worker) n'est interceptée. Le script du Worker Stockfish est renvoyé dans une
  réponse reconstruite (sans URL) : une réponse de cache garde son URL sans le fragment `#blob:…`,
  et stockfish.js retéléchargerait alors stockfish.wasm (échec hors connexion). Pas de skipWaiting
  automatique : bandeau « Nouvelle version disponible — Recharger » → SKIP_WAITING → rechargement.
  Tests : `serviceWorkers: 'block'` dans playwright.config (les page.route des autres tests doivent
  voir toutes les requêtes) ; `tests/e2e/pwa.spec.mjs` l'autorise (hors ligne réel via
  `context.setOffline`, bandeau de mise à jour en réécrivant dist/sw.js, local seulement).
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
- **Vidéos choisies** (`video.liens`, 47 fiches sur 58, oct. 2026, dont 21 avec une vidéo en
  français) : 1 à 4 par fiche, affichées dans la cellule Vidéo (« ▶ Titre (chaîne, FR) », nouvel
  onglet) et en tête du dialogue, **français d'abord**, puis anglais, puis autres langues. Règle :
  seulement une vidéo trouvée telle quelle dans un résultat réel — vidéothèque Lichess
  (lichess.org/video, identifiant YouTube, titre et auteur publiés, joignable depuis le dev ;
  aucune vidéo en français) ou recherche web (titre recopié). Jamais d'identifiant reconstruit
  ou deviné ; `&t=` seulement si l'auteur publie ce chapitre (recopié dans `chapitre`, contrôlé
  par les tests). Les résultats de recherche n'affichent souvent pas la chaîne (cas des vidéos
  FR) : `chaine: null` (permis seulement pour `source: 'recherche web'`), rien n'est deviné ; la
  CI donne la vraie chaîne (« chaîne à renseigner ») à recopier ensuite. Sans vidéo spécifique
  sûre : aucune (mieux vaut la recherche par langue). Les champs vidéo n'entrent pas dans
  l'empreinte Stockfish. youtube.com et l'oEmbed étant bloqués depuis l'environnement de
  développement, `scripts/verify-videos.mjs` tourne dans le job « online » de deploy.yml : oEmbed
  par vidéo, 404/400 = morte, 401/403 = restreinte, titre ou chaîne différents = modifiée,
  chaîne null = à renseigner ; annotations « warning », étape `continue-on-error` (jamais bloquante).
- Base des maîtres (explorer.lichess.org/masters, jeton requis, relais Worker avec db=masters) :
  bloc « Maîtres » du Coup optimal, bascule niveau/maîtres du tableau et de l'arbre, colonne
  Statistiques ; parties de maîtres ouvrables (/masters/pgn/{id}, jeton personnel).
- « Tester cette ligne » : ouvre la séquence sur #/moteur et la rejoue (400 ms/coup) ; pas de
  confirmation si la partie en cours est vide ou est elle-même une ligne testée (Event « Test : … »).
- Suite automatique (bouton « ⏩ Jouer la suite jusqu’à la fin », lancée après « Tester cette ligne ») :
  coup le plus joué de la base des maîtres tant que la position y a ≥ 10 parties (jeton requis),
  puis meilleur coup Stockfish (1 s/coup) pour les deux camps jusqu'au mat, pat, matériel
  insuffisant, triple répétition / 50 coups ; s'arrête si l'utilisateur joue, navigue ou change
  de partie. Pas d'explication automatique pendant la suite.
- Classement des variantes (menu « Classer ») : plus jouées / meilleur score pour mon camp
  (mon niveau ou maîtres, score = V + ½N, seulement ≥ 50 parties) ou meilleure évaluation
  Stockfish de fin de ligne ; charge les statistiques de toutes les fiches affichées.
- Révision espacée (Entraînement, mode « Révision ») : une carte = une position du répertoire
  où c'est à nous de jouer ; notée à la 1re tentative de chaque session (seul le coup de la fiche
  compte), y compris en mode Partie. Réussie : 1 j, 3 j, puis × facilité (2,5) ; ratée : revient
  10 min plus tard, facilité −0,2 (min 1,3). Stockage local `coach-echecs:revision-v1`.
- Bilan de la partie (page Moteur, bouton « Bilan ») : la partie est envoyée à « Mes parties »
  (`localGame`, id dérivé des coups → cache d'analyse réutilisé) et analysée comme une partie
  importée ; exclue de la vue d'ensemble. Indisponible pour une partie commencée depuis un FEN.
- Rapport détaillé (Mes parties, sous l'analyse) : `rapport()` dans games-core.js, sans IA.
  Note globale (perte moyenne, gaffes), déroulement par phase, bons coups (erreurs adverses
  sanctionnées, séries sans faute), erreurs expliquées (pièce en prise via chess.js, motifs
  détectés sur la variante de réfutation : mat, fourchette, matériel), variantes de Stockfish
  pour le coup joué et le meilleur coup (`deepen()` : 2 calculs ≥ 1 s par erreur principale,
  mis en cache avec l'analyse), occasions manquées, rappels « à retenir », exercices (position
  sans flèche, solution sur demande).
- Entraînement (accueil) : série de jours 🔥, maîtrise par répertoire, « Séance du jour »
  (3 lignes prioritaires + 3 punitions). Modules (drills.js, logique pure drills-core.js) :
  « Lignes » (l'app joue les coups adverses de la fiche ; erreur → plan + bon coup, position
  remise en fin de séance, 3 essais max ; un autre coup du répertoire n'est pas une faute),
  « Anti-trash » (coup douteux de la punition joué, séquence de punition ≤ 5 de nos coups en
  10/20/30 s). Tableau de progression (progress.js) : maîtrise = 70 % révision espacée des
  positions de la fiche + 30 % réussite aux exercices ; sorties de répertoire de « Mes parties »
  signalées (⚠) et prioritaires. Stockage local `coach-echecs:progression-v1`.
- Cours (module « Apprendre », cours.js + lesson-core.js) : leçon par fiche en 4 étapes
  (présentation, coups un par un, à retenir, pratique guidée). À chaque coup : nom officiel
  atteint (`noms` calculé au build depuis la base CC0, traduit par `nomFr`) et commentaires
  factuels chess.js (centre, développement, roque, prise, attaque, clouage, échec) ; aucune
  intention inventée (le plan vient de la fiche). Pratique guidée = module Lignes `guided`
  (indice : case de départ, puis le coup). Leçon suivie → `progress.cours`.
- Mes données (⚙ Réglages, transfer.js) : export/import d'un fichier JSON de toutes les clés
  `coach-echecs:*` SAUF les secrets (jeton Lichess, code d'accès, clé YouTube), jamais exportés
  ni écrasés par un import. Caches exclus.
- Drill anti-trash : un autre coup que la fiche est vérifié par Stockfish (700 ms, chrono
  suspendu) et accepté s'il gagne presque autant que la punition vérifiée (`seuilAutreCoup`).
- Mes parties : chargement automatique à la première ouverture si des pseudos sont enregistrés,
  analyse de la plus récente partie non analysée, badge « Nouveau » depuis le dernier chargement.
- Cache local Lichess (`PersistCache`, 12 h, 400 entrées) pour Cloud Eval et l'Opening Explorer.
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
  développement, cet export répondait 404 sans jeton : en fait au User-Agent de curl seulement
  (vérifié le 2026-10-22, voir Élite) ; l'application envoie le jeton personnel s'il existe. Chess.com : API publique `pub/player/{pseudo}/games/…`
  (CORS non vérifié localement ; test @online en CI). Analyse : une position = un calcul de
  `precision` ms, évaluations bornées à ±10 pions, mises en cache (40 parties) ; erreurs classées
  par perte (≥ 0,5 imprécision, ≥ 1,2 erreur, ≥ 3 gaffe) ; bilan = règles factuelles (sortie de
  répertoire, pièce laissée en prise, gaffe adverse non exploitée, phase la plus coûteuse).
- Interface en mode sombre par défaut (`:root[data-theme="light"]` pour le clair).

- **Élite blitz/rapide** (`scripts/elite.mjs` → `site/data/elite.json`) : top 50 blitz et rapide
  Lichess (`/api/player/top/{n}/{perf}`, export `/api/games/user/{u}` NDJSON, `perfType`, 100 parties
  max sur 3 mois) et Chess.com (`/pub/leaderboards` live_blitz/live_rapid, archives mensuelles,
  3 mois max). Parties classées gardées si 1.d4 d5 2.c4 ou 1.e4 c6 (ordre littéral), quel que soit le
  camp du joueur du top ; agrégation par FEN sans compteurs, de la racine du répertoire jusqu'au
  demi-coup 24 (les fiches vont jusqu'à 24) ; par coup : Blancs/nulles/Noirs, Elo moyen du joueur qui le joue,
  Lichess/Chess.com ; 3 parties exemples (meilleure moyenne Elo) avec leurs coups pour l'échiquier.
  Positions de moins de 2 parties retirées (seuil relevé automatiquement au-delà de 1,5 Mo).
  Requêtes série, pause de 60 s sur 429, User-Agent avec l'adresse du dépôt ; `LICHESS_TOKEN`
  facultatif (jamais écrit). Source en échec : notée dans `meta.sources`, jamais complétée.
  L'export Lichess répond **404 au User-Agent par défaut de curl** (pas à celui de Node ni des
  navigateurs) : c'était la cause des 404 « sans jeton » observés ; api.chess.com est bloqué depuis
  l'environnement de développement (fixtures Chess.com synthétiques). Node 22 n'utilise le proxy de
  l'environnement qu'avec `NODE_USE_ENV_PROXY=1` : le script se relance lui-même ainsi.
  **Mise à jour continue** (`.github/workflows/elite.yml`, seul écrivain, groupe de concurrence
  `donnees-elite`) : toutes les 30 min, `--incremental etat.json` ; le lundi (ou état absent, ou
  lancement manuel « complet ») reconstruction complète. `etat.json` garde par joueur × cadence la
  dernière partie vue et ses 100 dernières parties (id, date), les listes du top, les ETag Chess.com
  et les parties du répertoire gardées (coups SAN complets, pour les ouvrir sur l'échiquier).
  L'agrégat est **recalculé** à chaque passage depuis ces parties (dédoublonnées par plateforme + id) :
  fenêtre glissante de 3 mois, 100 dernières parties par joueur × cadence, joueurs sortis du top
  retirés, nouveaux venus chargés sur toute la fenêtre. Lichess : `since` = dernière partie − 3 h
  (une partie commencée avant le passage précédent peut finir après). Chess.com : archive du mois en
  cours (+ mois précédent tant qu'aucune partie du mois n'a été vue), `If-None-Match` → 304.
  Classement injoignable : liste précédente conservée et erreur notée. Publication : branche
  orpheline `donnees-elite` d'**un seul commit remplacé à chaque fois** (force push, sinon ≈ 50
  commits/jour de fichiers de 1 à 3 Mo), seulement si les données ont changé ; message
  « Élite : +N parties (date) ». Le site lit `raw.githubusercontent.com/…/donnees-elite/elite.json`
  (CORS `*` et `cache-control: max-age=300` vérifiés le 2026-10-22, 404 si la branche manque),
  rechargé au plus toutes les 5 min, sinon `./data/elite.json` (copie prise par deploy.yml sur la
  branche), sinon « non publié ». Affichage « Mis à jour il y a X min » (`meta.generatedAt` = dernier
  changement publié) et « 🔴 Nouvelles parties du top » (10 dernières, page Répertoire, ouvrables).
  Limites : un cron GitHub est souvent retardé de 5 à 20 min ; les workflows planifiés sont
  désactivés après 60 jours sans commit sur la branche par défaut (les commits de donnees-elite ne
  comptent pas) ; une partie apparaît au passage qui suit sa fin (+ jusqu'à 5 min de cache raw) ;
  date affichée = début de partie (Lichess) ou fin (Chess.com).
- **Joueurs suivis** (`scripts/elite-suivis.mjs`) : grands maîtres collectés même hors du top 50
  (plafond 200 parties par cadence, fenêtre 3 mois). Les comptes listés sont des candidats, vérifiés
  à chaque collecte (Lichess : dans la requête groupée `/api/users` ; Chess.com : `/pub/player/{u}`
  en reconstruction puis au plus une fois par semaine) : profil existant et ouvert, titre GM, nom réel
  concordant quand le profil en donne un, sinon « vérifié (titre seul) ». Verdicts dans
  `meta.sources.su.comptes`. Vérifié le 2026-10-22 sur Lichess : DrNykterstein, DrDrunkenstein
  (titre seul), alireza2003, AnishGiri ; rejetés à l'essai et retirés de la liste : gmwso (autre nom
  réel), comptes fermés ou sans titre. Chess.com (bloqué ici) n'est vérifié qu'en CI. Le nom usuel
  (« Magnus Carlsen ») est attaché aux parties (`wn`/`bn`) ; un compte non vérifié n'en reçoit pas.
- **Tournois retransmis** (source `bc`, « Tournois (retransmissions Lichess) ») : tournois de
  catégorie 5 (`tier`) ou annonçant un joueur suivi (`info.players`), sur 6 mois ; reconstruction :
  pages `/api/broadcast/top` (Lichess refuse les pages trop anciennes : « resource too old ») + une
  recherche `/api/broadcast/search?q=<nom>` par joueur suivi ; détail `/api/broadcast/{id}` puis
  export `/api/broadcast/{id}.pgn` (toutes les rondes) ; incrémental : page 1 (en cours et tout juste
  finis) et seulement les rondes terminées non lues (`/api/broadcast/round/{id}.pgn`). Parties
  gardées : les deux joueurs 2600+ (Elo FIDE de la retransmission) ou un joueur suivi (nom FIDE
  « Carlsen, Magnus », mots entiers). Ordre littéral 1.d4 d5 2.c4 / 1.e4 c6 : beaucoup de parties
  classiques arrivent au Gambit Dame par 1.d4 Cf6 2.c4 e6 3.Cf3 d5 et ne sont donc pas retenues.
  Les exports de retransmission sont lents (≈ 10 s par ronde) : la reconstruction hebdomadaire prend
  plusieurs dizaines de minutes (délai du job : 90 min).
- **Recherche par joueur** (barre `data-q` du Répertoire) : `joueurs.json` (branche donnees-elite,
  sinon copie du site) chargé à la première saisie : toutes les parties gardées (coups complets,
  ouverture nommée) et, par joueur (nom usuel des suivis, compte du top, nom des tournois), ses
  parties et sa couleur ; suggestions par `datalist`. Un index dédié plutôt qu'`etat.json` : etat.json
  contient l'état interne (dernières parties hors répertoire, ETag…) et grossit avec lui. Recherche
  insensible aux accents et à la casse, ≥ 3 caractères ; les fiches restent filtrées par la même
  requête ; si ni fiche ni joueur : message « Aucun joueur … » et liste de ce qui est couvert.
  Ouverture d'une partie : `openGame` avec White/Black/WhiteElo/BlackElo/Event/Site/Date/Result.

## Phase 2 (non implémenté)

- Vidéos pour les 11 fiches restantes (gaffes et sorties loufoques sans vidéo dédiée, Avance
  4.Fd3/4.Fe3) ; recopier les chaînes « à renseigner » signalées par la CI.
- Plus de fiches (le répertoire actuel couvre 58 lignes ; l'arbre Lichess couvre le reste).
- Parties d'un joueur précis (endpoint /player).

- Comparaison facultative de trois candidats (MultiPV 3), avec indication du coût de calcul.
- Exploration de variantes d'analyse (`analysisBranches`) séparée de la partie réelle ;
  analyse d'une position passée de l'historique.
- Base pédagogique sourcée (règles officielles FIDE, ouvertures, tactique, stratégie,
  structures de pions, finales) consultable par Claude ; base de parties annotées ;
  tables de finales compatibles. Ne pas entraîner de modèle d'échecs.
- Option multithread (coi-serviceworker) seulement après test réussi sur le site publié,
  Safari iOS compris, avec repli automatique monothread.
- Réclamation explicite d'une nulle / abandon dans l'interface.

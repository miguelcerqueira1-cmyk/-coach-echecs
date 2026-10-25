# CLAUDE.md — BlitzRefute, ex-Coach Échecs (synthèse du projet, mise à jour le 2026-10-26)

À lire en premier dans toute nouvelle session. Le code complet est dans le dépôt : ce fichier
explique le but, l'organisation, les choix et les règles. Ne pas y recopier de code.

## 1. Objectif

**Marque : BlitzRefute** (depuis le 2026-10-26) — « L'encyclopédie interactive et l'arme fatale pour
maîtriser tes ouvertures et détruire les pièges en Blitz. » Les clés localStorage gardent le préfixe
`coach-echecs:` (données des utilisateurs conservées).

Application web **en français** d'entraînement aux ouvertures, **grand public** (joueurs de club /
blitz ~1000–1400 Elo). Chaque visiteur choisit ses ouvertures parmi **12 répertoires** : avec les
Blancs (Gambit Dame, Italienne, Espagnole, Londres, Anglaise), contre 1.e4 (Caro-Kann, Sicilienne,
Française, Scandinave), contre 1.d4 (Indienne du Roi, GD refusé / Slave, Nimzo / Indienne de la
Dame). Seuls le **Gambit Dame** et la **Caro-Kann** (répertoire historique du créateur) ont des
fiches pour l'instant ; les autres sont affichés « bientôt ».
Utilisable sur téléphone (installable, hors connexion) et sur ordinateur, sans rien installer.

- Site publié : https://miguelcerqueira1-cmyk.github.io/-coach-echecs/
- Dépôt : github.com/miguelcerqueira1-cmyk/-coach-echecs (branche `main` ; branche de données
  `donnees-elite` gérée par un workflow).
- Pseudos de l'utilisateur : Lichess **LeugiMC**, Chess.com **QG_Miguel**.

### Principes non négociables
1. **Stockfish calcule, chess.js valide, Claude explique.** Aucune évaluation, variante, mat,
   statistique ou pourcentage ne vient d'un modèle de langage. Rien d'inventé : vidéos, comptes de
   joueurs, lignes tactiques, noms d'ouverture → toujours issus d'une source vérifiable.
2. **Secrets** : la clé API Anthropic n'existe que dans les secrets du Worker Cloudflare (jamais
   dans le dépôt, le HTML ou le bundle). Le jeton Lichess, le code d'accès et la clé YouTube restent
   sur l'appareil (localStorage) et ne sont jamais exportés. Ne jamais demander un secret en clair
   dans la conversation.
3. **Continuité de la partie** : le modèle `Game` est la source de vérité ; tout résultat moteur
   ou Claude obsolète (jeton périmé) est ignoré.
4. Toute ligne tactique (punition, piège) est **vérifiée par Stockfish** avant publication.

## 2. Ce que fait l'application (4 pages, navigation par hash)

| Page | Contenu |
|---|---|
| `#/accueil` | Page publique (1re visite, logo) : marque, fonctions, ouvertures (fiches publiées / « bientôt »), formules Gratuit / Pro 29 €, « Choisir mes ouvertures ». |
| `#/ouvertures` | Choix en 3 étapes (Blancs, contre 1.e4, contre 1.d4), plusieurs ou aucun par étape, au moins un au total ; enregistré puis rechargement sur `#/repertoire`. Aussi depuis ⚙ « Mes ouvertures ». |
| `#/moteur` | Échiquier ; conseil Stockfish après chaque coup réellement joué (confirmer pour l'enregistrer) ; panneau « Coup optimal » (Stockfish local, Lichess Cloud Eval, meilleur % de victoire à mon niveau, coup des maîtres, coup de l'Élite) ; navigation ⏮◀▶⏭ et analyse des positions passées ; explication gratuite sans IA (ou Claude si configuré) ; mode « Indice d'abord » ; noms/Elo des joueurs au-dessus de l'échiquier ; « Jouer la suite jusqu'à la fin » (théorie des maîtres puis Stockfish) ; « Bilan de la partie » ; import/export PGN/FEN. |
| `#/repertoire` | 58 fiches (31 Gambit Dame, 27 Caro-Kann) : ECO + nom, séquence, évaluation (Cloud Eval + vérif Stockfish), statistiques (mon niveau / maîtres / Élite), plan & structure, punition, piège, cases clés, vidéos. Filtres rapides, recherche (nom, coup FR/EN « 3…Fg4 », code ECO, **nom de joueur** → ses parties), « Classer » (plus jouées, meilleur score, meilleure éval), section « Anti-trash Blitz », « ▶ Tester cette ligne », arbre des coups (niveau/maîtres/Élite), « 🔴 Nouvelles parties du top », export PGN (étude Lichess / Chess.com). |
| `#/entrainement` | Accueil en parcours : **📖 1. Apprendre** (cours par fiche : présentation → coups un par un avec le nom officiel atteint et des commentaires factuels → à retenir, piège et punition **jouables coup par coup** sur l'échiquier → pratique guidée avec indices), **📚 2. S'entraîner** (lignes en répétition espacée : l'app joue l'adversaire, erreur → plan + bon coup, position remise en boucle), **⏱ 3. Réflexes anti-trash** (punition chronométrée 10/20/30 s ; un autre coup gagnant vérifié par Stockfish est accepté), **🎯 Mes vraies erreurs** (positions de mes parties Lichess/Chess.com : sorties de répertoire et punitions manquées, à rejouer jusqu'à validation), **⚡ Séance du jour**, **📊 progression** par variante (maîtrise %, série 🔥, sorties réelles ⚠). « Autres modes » : partie contre l'adversaire (coups tirés de Lichess), positions isolées. |
| `#/parties` | Import des dernières parties Lichess/Chess.com (automatique à l'ouverture si pseudos enregistrés, badge « Nouveau »), sortie du répertoire, analyse Stockfish coup par coup, courbe, bilan, **rapport détaillé écrit** (note, déroulement, bons coups, erreurs expliquées avec la suite du moteur, occasions manquées, à retenir, exercices). |

⚙ Réglages : budget moteur, niveau des explications, mode d'aide, **apparence** (thème, échiquier,
couleur principale, aperçu direct), code Claude, jeton Lichess, clé YouTube, **Mes données**
(exporter/importer un fichier entre appareils), installation de l'appli, avancé.

## 3. Arborescence

```
site/                         Site statique (GitHub Pages), modules ES, aucun bundler
  index.html                  Coquille + dialogues ; petit script de tête qui applique l'apparence avant affichage
  css/app.css                 Thèmes (variables CSS), styles d'échiquier, toutes les pages
  sw.js, manifest.webmanifest, icons/   Appli installable / hors connexion (sw.js complété par build.mjs)
  js/main.js        (1369 l.) Contrôleur page Moteur : cycle coup → calcul → conseil → explication,
                              réglages, routeur, ouverture de lignes/parties, suite automatique, bilan, export/import
  js/game.js                  Modèle de partie (rejeu, fins de partie FIDE, PGN/FEN tolérants, jetons)
  js/engine.js                Client UCI Stockfish (Web Worker, une tâche à la fois, annulation, chien de garde)
  js/analysis.js              Conseils : validation des variantes, scores, notation française (sanFr)
  js/board.js                 Échiquier DOM (clic/glisser, flèches SVG, promotion, setHint)
  js/coach.js                 Client API Claude (Worker) + vérification des coups cités
  js/explain-free.js          Explication gratuite sans IA (faits chess.js + calculs Stockfish)
  js/hints.js                 Indices progressifs (mode « Indice d'abord »)
  js/optimal.js               Panneau « Coup optimal »
  js/lichess.js               Cloud Eval, Opening Explorer (niveau/maîtres), file série, pause 429,
                              cache mémoire + PersistCache (localStorage, 12 h)
  js/repertoire-page.js (818 l.) Page Répertoire (rendu, recherche, classement, arbre, vidéos, export)
  js/repertoire-pgn.js        Export PGN (variantes, $2, commentaires)
  js/lines.js                 Lecture des lignes, index ECO, empreintes de fiche
  js/youtube.js               Recherche YouTube Data v3 (clé perso facultative, cache 7 j)
  js/elite.js                 Données Élite : chargement (raw GitHub → copie du site), lecture par FEN
  js/joueurs.js, joueurs-ui.js  Recherche par nom de joueur (index joueurs.json) et affichage en cartes
  js/training.js   (558 l.)  Page Entraînement : accueil, cours, modules, tableau de progression, anciens modes
  js/training-core.js         Arbre du répertoire, tirage pondéré, verdicts, révision espacée (SM-2 simplifié)
  js/drills.js / drills-core.js  Modules Lignes (+ mode guidé) et Anti-trash ; seuilAutreCoup
  js/cours.js / lesson-core.js   Leçons : étapes, nomFr (traduction des noms ECO), commentaires factuels, ordre du cours
  js/progress.js              Progression (lignes, drills, jours, sorties, cours), maîtrise, tableau de bord
  js/games.js / games-core.js Mes parties : formats, sortie de répertoire, analyse, bilan, rapport détaillé
  js/storage.js               localStorage (partie, réglages, secrets locaux)
  js/theme.js                 Thèmes / styles d'échiquier / couleur principale
  js/transfer.js              Export/import des données (sans secrets)
  js/pwa.js                   Service worker, bandeau de mise à jour, aide à l'installation
  js/router.js                Navigation par hash
  data/repertoires/meta.js    Les 12 répertoires (id, titre, couleur, groupe, racine SAN, gratuites, elite)
  data/repertoires/<id>.js    **Fiches d'un répertoire** (à éditer : `export default [ …fiches ]`)
  data/repertoire.js          Agrège (REPERTOIRES, GROUPES, BADGES, LIGNES) + conventions des fiches ;
                              repertoire.json, elite.json, joueurs.json GÉNÉRÉS
  js/mon-repertoire.js        Ouvertures choisies (`coach-echecs:mon-repertoire`), filtrerData
  js/accueil.js, js/choix.js  Page d'accueil publique, écran de choix des ouvertures
  pieces/                     SVG cburnett ; vendor/ et engine/ GÉNÉRÉS (postinstall)
worker/src/                   Cloudflare Worker (API Claude, relais explorer) : index.js, prompt.js
scripts/                      vendor, build (→ dist/), serve, icons, repertoire (ECO + noms par coup → JSON),
                              verify-repertoire (+ uci-node, Stockfish Node), probe-line,
                              elite.mjs / elite-core.mjs / elite-suivis.mjs (collecte Élite), verify-videos
data/chess-openings/          Base ECO CC0 (lichess-org/chess-openings)
data/verification.json        Résultats Stockfish (profondeur 18) par empreinte de fiche
tests/unit/ (13 fichiers)     node:test — npm test
tests/e2e/                    Playwright, vrai Stockfish : app, lichess, elite, games, training, pwa, pro, grand-public
.github/workflows/deploy.yml  vérification → tests e2e (image Playwright) → Worker → Pages → contrôle du site publié
.github/workflows/elite.yml   collecte Élite (≈ toutes les heures, complète le lundi) → branche donnees-elite
```

## 4. Choix de design

- **Thème par défaut « Nuit néon »** choisi par l'utilisateur : fond `#0b0d1e`, surfaces
  `#15183a`, accent violet `#9d8cff`, police **Space Grotesk** (Google Fonts), échiquier lavande /
  indigo (`#c7caf0` / `#5c61b8`) avec halo, dernier coup turquoise. Autres thèmes : Sombre classique,
  Clair. 9 styles d'échiquier (Néon, Érable, Noyer, Marbre, Ardoise bleue, Sapin, Corail, Encre et
  papier, Classique) ; couleur principale personnalisable (contraste calculé). Maquettes d'origine :
  canvas Design « Coach Échecs — propositions de design » (claude.ai/artifact/FVadLdy7QBZ4Gj1ZvpcJDx).
- Couleurs = variables CSS sur `:root[data-theme]` et `:root[data-board]` ; flèches : vert = meilleur
  coup, orange = réponse, rouge = menace/coup fautif, bleu = statistique.
- **Téléphone d'abord** : aucun défilement horizontal (testé en Chromium et WebKit/iPhone). Pièges
  connus : Safari ne laisse pas un `<select>` rétrécir dans une grille (sur téléphone, menus en
  pleine largeur sous leur libellé) ; ne jamais recréer la case de recherche pendant la frappe
  (Safari perd la saisie) ; listes de suggestions courtes (≤ 12) ; tableaux larges → cartes.
- Textes : français, notation française (C, F, T, D, R), ton direct ; chiffres toujours sourcés
  (« fréquence observée, pas une évaluation »).

## 5. Décisions techniques importantes

- **Stockfish 18 lite monothread** (stockfish.js 18.0.8, WASM 7,3 Mo), pleine force. WASM mis en
  cache (Cache Storage) et passé au Worker par `stockfish.js#<blob-url>` (le service worker reconstruit
  la réponse du script pour garder ce fragment). Multithread non activé (pas de COOP/COEP sur Pages).
- **3 coups candidats** (page Moteur) : MultiPV 3 sur le budget habituel (1 pendant la suite
  automatique, menaces et analyses de parties) ; lignes rejouées par chess.js, meilleur coup en tête,
  écart en pions ; flèches discrètes (`alt`) ; masqués en mode « Indice d'abord ».
- **Jetons** `{gameId, branchId, revision, ply}` pour ignorer les résultats périmés ; moteur partagé
  entre pages (une page peut interrompre le calcul d'une autre, la page Moteur relance au retour).
- Fins de partie FIDE : triple répétition / 50 coups = nulles réclamables ; fins automatiques :
  mat, pat, matériel insuffisant, quintuple répétition, 75 coups.
- **Lichess** : Cloud Eval public ; Opening Explorer et base des maîtres exigent un jeton (jeton
  personnel sans permission, ou relais Worker). Une requête à la fois, 60 s de pause après un 429.
  Chess.com n'a pas de statistiques d'ouvertures agrégées.
- **Répertoire** : ECO et noms par la base CC0 (position la plus profonde) ; `noms` = nom atteint à
  chaque coup (pour les cours, traduit par `nomFr`). Punition ≥ +1,5 (ou `minCp` explicite), piège
  ≤ −1,5, vérifiés à profondeur 18 ; CI : `verify-repertoire --all --dry`.
- **Vidéos** : seulement des vidéos trouvées telles quelles (vidéothèque Lichess, recherche web),
  jamais d'identifiant deviné ; `&t=` seulement si l'auteur a publié ce chapitre ; français affiché
  en premier ; contrôle oEmbed en CI (une annotation unique « Vidéos à vérifier »), non bloquant.
  Chapitres : `scripts/video-chapters.mjs` (workflow à la demande `chapitres.yml`, youtube.com bloqué
  en développement) lit les horodatages des descriptions ; résultat dans le journal du job.
- **Élite** : top 50 blitz/rapide Lichess + Chess.com, 16 grands maîtres suivis (comptes vérifiés à
  chaque collecte : titre GM, nom réel), tournois retransmis sur Lichess (2600+ ou joueur suivi).
  Parties gardées si elles atteignent **par position** l'arbre du répertoire dans les 16 premiers
  demi-coups (transpositions comprises), agrégées par FEN. Collecte incrémentale (≈ horaire, cron
  GitHub retardé) et complète le lundi ; publication sur la branche `donnees-elite` (un seul commit
  remplacé) ; le site lit `raw.githubusercontent.com` (cache 5 min), copie de secours dans le site.
  Chiffres au 2026-10-23 : Lichess 1 127, Chess.com 812, tournois 235 parties gardées.
  **Règle de couleur** (⚙ « Élite : seulement les parties où le joueur du top a mon camp ») :
  partie marquée `c` si notre camp (Blancs GD / Noirs CK) est tenu par un propriétaire de la partie
  (joueur du top ou suivi) ou, en tournoi, par un joueur suivi ou à 2600+ (`campDuTop`) ; colonnes
  blancs/nulles/noirs supplémentaires par coup (omises si nulles) ; sans répartition par plateforme.
  Fichier antérieur à l'option → message « Règle de couleur indisponible », rien d'extrapolé.
- **Exercices (cours, lignes, anti-trash)** : coup refusé → la pièce ne bouge pas, case rouge,
  secousse, bulle (`raisonErreur` : piège de la fiche, sinon pièce en prise selon chess.js, sinon
  rappel du coup ; jamais d'évaluation inventée ; en pratique guidée, coup non révélé à la 1re
  erreur). Série « 🔥 Série : X » (réussites du premier coup). Fin de séance : bilan « X réussies,
  Y ratées » puis « 🎯 Revoir uniquement mes erreurs » (file des positions ratées, une ratée
  repasse en fin de file, jusqu'à validation de toutes).
- **Mes vraies erreurs** : à l'import (Mes parties), `positionARevoir` (games-core) tire de chaque
  partie la position de sortie des fiches (attendu : coups des fiches) ou de punition manquée
  (attendu : 1er coup de la punition) ; stockée dans `progression-v1.sorties` (moves/expected UCI,
  une par partie, ancien enregistrement complété) ; validée → `corrige` (sort de la liste) ;
  la position compte aussi en révision espacée si elle est dans l'arbre. Parties de l'échiquier
  Moteur exclues ; une punition manquée ne compte pas comme « sortie » au tableau de bord.
- **Révision espacée** : carte = position du répertoire où c'est à nous de jouer ; réussie 1 j, 3 j,
  puis × facilité ; ratée → 10 min. Maîtrise d'une fiche = 70 % positions révisées + 30 % exercices.
- **Rapport de partie** (sans IA) : erreurs classées par perte (≥ 0,5 / 1,2 / 3 pions), variantes
  Stockfish du coup joué et du meilleur coup, motifs détectés par chess.js (mat, fourchette,
  matériel, pièce en prise).
- **Hors connexion** : précache de dist/ (sauf WASM, données Élite) ; réseau d'abord pour la
  navigation, config et manifeste moteur ; jamais d'interception d'une autre origine ; mise à jour
  sur action de l'utilisateur (bandeau « Recharger »).
- **Worker Claude** : code d'accès (SHA-256, comparaison à temps constant), limites par IP et par
  jour, CORS limité au site, Durable Object pour les compteurs. Modèle par défaut configurable
  (variable `CLAUDE_MODEL`).

## 5 ter. Grand public : choix des ouvertures

- `mon-repertoire.js` : `initChoix()` au démarrage, **avant toute écriture** : aucun choix + aucune
  clé `coach-echecs:*` → première visite → `#/accueil` (sauf lien direct vers une page) ; données
  existantes → Gambit Dame + Caro-Kann enregistrés (`auto: true`), rien ne change. Exporté par
  « Mes données ». Les pages filtrent `repertoire.json` (`filtrerData` : `entries`, `repertoires`,
  `choisis` = choix ; `tous` = toutes les fiches).
- Répertoire choisi sans fiche : onglet « bientôt » + carte « en préparation » (Répertoire), carte
  « bientôt » (Entraînement) ; si aucune ouverture choisie n'a de fiche, l'Entraînement le dit.
- Sorties de répertoire (`repertoireDeviation(game, entries, reps)`) : candidats = répertoires
  choisis de la couleur jouée (Blancs : 1er coup du répertoire ; Noirs : réponse prévue au 1er coup
  adverse) ; le répertoire suivi le plus loin l'emporte (ex. Gambit Dame et Londres après 1.d4).
- Élite : collecte limitée aux répertoires `elite: true` (gd, ck) ; ailleurs « données Élite pas
  encore collectées pour cette ouverture ».
- **Ajouter des fiches à un répertoire** : écrire dans `site/data/repertoires/<id>.js` (même format
  que gd.js : id unique préfixé, `rep: '<id>'`, famille, nom, badge, ligne SAN anglaise, plan,
  structure, punition/piège `{ ligne avec « ? » sur le coup fautif, texte }`, cases, echanger,
  conserver, video), désigner une fiche gratuite dans `meta.js` (`gratuites`), puis
  `npm run verify:repertoire` (Stockfish profondeur 18, met à jour data/verification.json),
  `node scripts/repertoire.mjs`, `npm test`.

## 5 bis. Formule Gratuit / Pro (`site/js/pro.js`)

- Gratuit : Moteur, Mes parties (dont PGN collé), une variante de base par ouverture `FREE_FICHES`
  (tirée de `gratuites` dans repertoires/meta.js ; aujourd'hui gd-orthodoxe, ck-classique,
  ck-avance-short : fiche + leçon). Pro : autres fiches (lignes
  verrouillées, contenu flouté, aucune requête), anti-trash, S'entraîner / révision espacée, séance du
  jour, Mes vraies erreurs, autres modes, leçons Pro. Fenêtre `#dlg-pro` (`openPaywall`).
- Paiement : `config.json.paymentUrl` (variable `PAYMENT_URL` au build) ; vide → « Le paiement en
  ligne ouvre bientôt ». Aucune délivrance de licence après paiement pour l'instant.
- Code d'accès (admin) : seule son empreinte SHA-256 est dans le code (`CODE_HASHES`) ; drapeau
  `coach-echecs:pro` (jamais exporté par « Mes données »). Les tests e2e tournent en Pro
  (`pro.spec.mjs` couvre la formule gratuite).
- **Limites à dire à l'utilisateur** : protection purement côté navigateur (contenu dans le dépôt
  public et le JS, drapeau modifiable) ; GitHub Pages interdit un usage principalement commercial
  (SaaS) → avant de vendre : hébergement (ex. Cloudflare Pages), dépôt privé, vérification de
  licence côté serveur (Worker) + paiement (Stripe) ; conditions d'usage commercial des API
  Lichess / Chess.com et licences (Stockfish GPLv3, pièces cburnett GPL) à vérifier.

- **Décisions de vente (2026-10-26)** : prix **29 € accès à vie** ; paiement **Lemon Squeezy**
  (revendeur officiel : TVA, factures, clés de licence) ; statut micro-entreprise **en cours de
  création** par l'utilisateur → tout est préparé en mode test, la vente n'ouvre qu'une fois le
  statut obtenu. Plan : 1. comptes Cloudflare + Lemon Squeezy (utilisateur) ; 2. hébergement
  Cloudflare Pages + dépôt privé ; 3. vrai verrou (contenu Pro servi par le Worker contre une clé de
  licence Lemon Squeezy validée) — branche `licences-pro` ; 4. pages légales ; 5. achat test.

## 6. Stockage local (clés `coach-echecs:*`)

`partie:v1`, `partie-precedente:v1`, `reglages:v1` (dont theme/board/accent, eliteCamp), `entrainement`,
`revision-v1`, `progression-v1`, `mes-parties`, `analyses-v1`, `videos-perso`, `lichess-cache-v1`,
`youtube-v1`, `pro` (formule, propre à l'appareil), `mon-repertoire` (ouvertures choisies) ; **secrets** (jamais exportés) : `jeton-lichess`, `code-acces`, `cle-youtube`.

## 7. Commandes

```
npm ci                         # dépendances + copie chess.js / Stockfish dans site/
npm test                       # tests unitaires (≈ 100)
npm run build                  # dist/ (COACH_API_URL=... pour l'API Claude)
node scripts/serve.mjs 4180 dist /coach-echecs/            # serveur local (port libre)
BASE_URL=http://localhost:4180/coach-echecs/ npx playwright test   # e2e (≈ 66), WITH_WEBKIT=1 en CI
npm run verify:repertoire      # après modification d'une fiche (recalcule data/verification.json)
node scripts/verify-repertoire.mjs --check
cd worker && npm ci && npm test
node scripts/elite.mjs --fixture tests/fixtures/elite --top 2 --now 2026-10-22T12:00:00Z --out /tmp/elite.json
gh workflow run elite.yml -R miguelcerqueira1-cmyk/-coach-echecs --ref main -f mode=complet
```

## 8. Règles de travail (pour Claude)

- Toujours lancer `npm test` et les tests Playwright avant de pousser ; pousser sur `main`
  (`git push origin main`) puis suivre la CI (`gh run list`, annotations via l'API GitHub).
- Messages de commit en français, terminés par les deux lignes d'attribution demandées par la
  session ; ne jamais écrire de nom ou d'identifiant de modèle ailleurs dans le dépôt.
- Playwright local : si le Chromium attendu manque dans /opt/pw-browsers, pointer
  PLAYWRIGHT_BROWSERS_PATH vers un dossier où `chromium_headless_shell-<version attendue>/chrome-linux/headless_shell`
  est un lien vers le chrome-headless-shell installé (ne jamais lancer `playwright install`).
- Environnement de développement cloud : youtube.com, api.chess.com et github.io sont bloqués
  (vérifier via la CI) ; lichess.org et raw.githubusercontent.com sont joignables. Si le port 4173
  est pris, servir dist/ sur un autre port et utiliser `BASE_URL`.
- GitHub n'affiche que 10 annotations par étape : regrouper les rapports en une annotation.
- Ne jamais ajouter de ligne tactique, de vidéo ou de compte sans vérification ; si une donnée
  manque, l'afficher comme absente.
- L'utilisateur est sur téléphone le plus souvent, non développeur : expliquer simplement, en
  français, et économiser les tokens (pas de surveillance CI continue inutile, agents parallèles
  seulement pour les gros chantiers).

## 9. Reste à faire / idées

- **Vidéos** : chaînes toutes renseignées (rapport oEmbed de la CI du 2026-10-23). 9 fiches sans
  vidéo (gd-g5, gd-fg4, gd-h5, gd-dd6, ck-avance-fd3, ck-avance-fe3, ck-dh5, ck-fd3, ck-df3) :
  aucune vidéo trouvée dans la vidéothèque Lichess ni par recherche web (lignes trop rares).
  Horodatages : 40 liens sur 95 ont un `&t=` tiré d'un chapitre publié ; les 21 vidéos à chapitres
  ont été exploitées (workflow « Chapitres des vidéos », 2026-10-24) ; les autres n'en publient pas
  → s'ouvrent au début, signalé dans le cours. Contenu à confirmer en regardant la vidéo :
  gd-marshall-gambit (« Marshall Gambit Madness » : Gambit Marshall du GD ou attaque Marshall de
  l'Espagnole ?).
- **À vérifier par l'utilisateur** : installation sur iPhone (icône, hors connexion après une
  visite), bouton d'installation sur Android.
- **Explications Claude** : inactives tant que les 4 secrets GitHub (ANTHROPIC_API_KEY,
  CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, COACH_ACCESS_CODE) ne sont pas créés — payant à
  l'usage, décision de l'utilisateur ; l'explication gratuite fonctionne sans.
- Élite : le workflow planifié est désactivé par GitHub après 60 jours sans commit sur `main`.
- Plus de fiches (58 aujourd'hui) ; commentaires de coups rédigés et vérifiés pour les cours.
- Analyse : variantes d'analyse (`analysisBranches`)
  séparées de la partie réelle ; réclamation de nulle / abandon dans l'interface.
- Option multithread (coi-serviceworker) seulement après test réussi sur le site publié et Safari iOS.
- Projet futur séparé (nouveau dépôt) : boutique en ligne de créations faites main (crochet,
  pulls, attrape-rêves, sacs) — site vitrine + paiement Stripe, éventuellement Etsy en parallèle.

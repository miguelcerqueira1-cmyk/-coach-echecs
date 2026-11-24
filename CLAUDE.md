# CLAUDE.md — BlitzRefute, ex-Coach Échecs (synthèse du projet, mise à jour le 2026-11-23)

À lire en premier dans toute nouvelle session. Le code complet est dans le dépôt : ce fichier
explique le but, l'organisation, les choix et les règles. Ne pas y recopier de code.

## 1. Objectif

**Marque : BlitzRefute** (depuis le 2026-10-26) — « L'encyclopédie interactive et l'arme fatale pour
maîtriser tes ouvertures et détruire les pièges en Blitz. » Les clés localStorage gardent le préfixe
`coach-echecs:` (données des utilisateurs conservées).

Application web **en français** d'entraînement aux ouvertures, **grand public** (joueurs de club /
blitz ~1000–1400 Elo). Chaque visiteur choisit ses ouvertures parmi **29 répertoires** : avec les
Blancs (Gambit Dame, Italienne, Espagnole, Londres, Écossaise, Catalane, Viennoise, Smith-Morra,
Anglaise), contre 1.e4 (Caro-Kann, 1…e5, Sicilienne, Française, Scandinave, Pirc, Alekhine, Philidor,
Najdorf, Dragon), contre 1.c4 / 1.Cf3 (Contre l'Anglaise 1.c4 e5, Contre 1.Cf3 Réti), contre 1.d4
(+ Grünfeld, Benoni / Benko, Bogo-indienne) (Indienne du Roi, GD refusé / Slave, Contre le
Londres, Hollandaise, Nimzo / Indienne de la Dame). **269 fiches** (2026-11-23) : Gambit Dame 31,
Caro-Kann 27 (répertoire historique du créateur), Italienne 12, Espagnole 13, Londres 12, Écossaise 10,
Anglaise 8, 1…e5 8, Sicilienne 9 (système Taimanov), Française 8, Scandinave 8, Indienne du Roi 8,
GD refusé / Slave 10, Contre le Londres 8, Hollandaise 5, Nimzo / Indienne de la Dame 8, Pirc 7, Alekhine 8, Catalane 8, Grünfeld 8, Najdorf 7,
Dragon 7, Contre l'Anglaise 5, Contre 1.Cf3 6, Benoni / Benko 6,
Bogo-indienne 5, Philidor 5, Viennoise 6, Smith-Morra 6 ; toutes
vérifiées par Stockfish (profondeur 18). Objectif de l'utilisateur : le plus de répertoires et de
variantes possible (concurrencer les grands sites d'entraînement, prix plus bas, options en plus).
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
| `#/ouvertures` | Choix en 4 étapes (Blancs, contre 1.e4, contre 1.d4, contre 1.c4 / 1.Cf3 — groupe `autres`), plusieurs ou aucun par étape, au moins un au total ; enregistré puis rechargement sur `#/repertoire`. Aussi depuis ⚙ « Mes ouvertures ». |
| `#/moteur` | Échiquier ; conseil Stockfish après chaque coup réellement joué (confirmer pour l'enregistrer) ; panneau « Coup optimal » (Stockfish local, Lichess Cloud Eval, meilleur % de victoire à mon niveau, coup des maîtres, coup de l'Élite) ; navigation ⏮◀▶⏭ et analyse des positions passées ; explication gratuite sans IA (ou Claude si configuré) ; mode « Indice d'abord » ; noms/Elo des joueurs au-dessus de l'échiquier ; « Jouer la suite jusqu'à la fin » (théorie des maîtres puis Stockfish) ; « Bilan de la partie » ; import/export PGN/FEN. |
| `#/repertoire` | Fiches des ouvertures choisies (168 au total) : ECO + nom, séquence, évaluation (Cloud Eval + vérif Stockfish), statistiques (mon niveau / maîtres / Élite), plan & structure, punition, piège, cases clés, vidéos. Filtres rapides, recherche (nom, coup FR/EN « 3…Fg4 », code ECO, **nom de joueur** → ses parties), « Classer » (plus jouées, meilleur score, meilleure éval), section « Anti-trash Blitz », « ▶ Tester cette ligne », arbre des coups (niveau/maîtres/Élite), « 🔴 Nouvelles parties du top », export PGN (étude Lichess / Chess.com). |
| `#/entrainement` | Accueil en parcours : **📖 1. Apprendre** (cours par fiche : présentation → coups un par un avec le nom officiel atteint et des commentaires factuels → à retenir, piège et punition **jouables coup par coup** sur l'échiquier → pratique guidée avec indices), **📚 2. S'entraîner** (lignes en répétition espacée : l'app joue l'adversaire, erreur → plan + bon coup, position remise en boucle), **⏱ 3. Réflexes anti-trash** (punition chronométrée 10/20/30 s ; un autre coup gagnant vérifié par Stockfish est accepté), **🎯 Positions de mes parties** (ex-« Mes vraies erreurs » : sorties de répertoire et punitions manquées de mes parties Lichess/Chess.com, à rejouer jusqu'à validation), **📊 progression** par variante, repliée (maîtrise %, série 🔥, sorties réelles ⚠). Point d'entrée : **📅 Ma routine du jour** en haut (a remplacé « Séance du jour »). « Autres modes » : partie contre l'adversaire (coups tirés de Lichess), positions isolées. |
| `#/progression` | « Ma progression » (hors onglets, liens depuis Entraînement et Mes parties) : courbes Lichess, classements Chess.com, routine sur 4 semaines, chiffres de l'entraînement. |
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
  js/pwa.js                   Service worker, bandeau de mise à jour
  js/installation.js / installation-core.js  Guide d'installation, rappels de sauvegarde, stockage persistant
  js/router.js                Navigation par hash
  data/repertoires/meta.js    Les 29 répertoires (id, titre, couleur, groupe, racine SAN, gratuites, elite)
  data/repertoires/<id>.js    **Fiches d'un répertoire** (à éditer : `export default [ …fiches ]`)
  data/repertoire.js          Agrège (REPERTOIRES, GROUPES, BADGES, LIGNES) + conventions des fiches ;
                              repertoire.json, elite.json, joueurs.json GÉNÉRÉS
  js/mon-repertoire.js        Ouvertures choisies (`coach-echecs:mon-repertoire`), filtrerData
  js/accueil.js, js/choix.js  Page d'accueil publique, écran de choix des ouvertures
  pieces/                     SVG « Celtic » (Maurizio Monge, MIT, LICENSE.txt) ; vendor/ et engine/ GÉNÉRÉS (postinstall)
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
- **Lignes complètes** : `scripts/prolonge-lignes.mjs` (Stockfish profondeur 16, jusqu'au 30e
  demi-coup) → `data/prolongations.json` (par empreinte) → `entry.suite` ; affichée « 🤖 suite
  Stockfish » (cours, S'entraîner ; réglage Longueur). S'entraîner : temps par coup (trop lent =
  raté), bilan des temps, répétitions jusqu'à N fois d'affilée sans faute. À relancer après ajout
  ou modification de fiches.
- **Cours « les plus jouées d'abord »** : `scripts/frequences.mjs` → `data/frequences.json` (nombre
  de parties Élite où le coup qui définit la fiche a été joué) → `entry.freq` ; ordre par défaut
  quand le répertoire a des données (gd, ck, gdr-noirs), bascule « Ordre conseillé ». Données
  figées : relancer `node scripts/frequences.mjs` pour les rafraîchir.
- **Ma routine du jour** (`routine-core.js`, carte en haut de l'Entraînement) : 6 blocs lun–sam
  (tactique anti-tunnel sur thèmes Lichess « Pièce en prise » / « Coup défensif » en alternance,
  Puzzle Rush, théorie lancée en ligne complète 5 s/coup, 1 partie rapide 10 min, analyse moteur
  coupé, Blitz 5 max), dimanche théorie seule ; cases cochées et suivi du soir (menaces ratées,
  Blitz joués, problèmes /10) dans `coach-echecs:routine-v1` ; historique 7 jours, série.
  **Tactique dans l'appli** (2026-11-16, `puzzles.js` / `puzzles-core.js`) : 10 problèmes de l'API
  publique Lichess `GET /api/puzzle/next?angle=<thème>&difficulty=easier` (anonyme, base CC0),
  joués sur l'échiquier de l'appli : dernier coup adverse rejoué, coup faux refusé (règle Lichess :
  tout mat accepté), « Voir la solution » ; réussi = sans erreur ni solution ; 10 faits → suivi du
  soir « problèmes /10 » rempli et bloc coché ; lien « ou sur Lichess » gardé (iframe impossible :
  X-Frame-Options). **Théorie progressive** (`planTheorie`, progress.js) : bouton « 📖 Apprendre :
  <prochaine leçon> » (répertoire le moins avancé) + révision des seules variantes déjà apprises
  (leçon suivie), sans chrono et fiche seule ; rythme Blitz (ligne complète, 5 s) seulement si
  toutes sont maîtrisées (≥ 80 %). **Même longueur partout (2026-11-17)** : la leçon, sa pratique
  guidée et la théorie de la routine (révision et rythme Blitz) n'utilisent que la ligne de la fiche ;
  la suite Stockfish (« Longueur : complète ») reste un choix de S'entraîner. Révision avant de jouer (option `apercu` de DrillRunner,
  `relire`) : la ligne défile coup par coup (flèches, coups écrits, plan), puis « À moi de jouer ».
  **📒 Mes variantes apprises** (bloc Théorie, repliable) : leçons suivies, la plus récente d'abord
  (ECO, nom, ouverture, date, coups de la fiche en notation française, maîtrise), « Revoir la
  leçon », « 📋 Copier la liste » (presse-papiers, pour les notes de l'utilisateur).
  Niveau des problèmes réglable (`NIVEAUX` : très facile ≈ 700–850 par défaut, facile ≈ 950–1250,
  moyen ≈ 1500 ; fourchettes observées sur l'API sans compte) dans `routine-v1.niveau`.
  **Routine pour chacun (2026-11-22)** : profil `routine-v1.profil` {temps 20/45/90, sites
  lichess/chesscom, cadences bullet/blitz/rapide}, demandé par 3 questions au premier lancement
  (« ⚙ Modifier » ensuite) ; sans profil mais avec un historique → `PROFIL_HISTORIQUE` (routine
  d'origine, 6 blocs, inchangée). `blocsDuJour(date, profil)` : 20 min = 5 problèmes + théorie ;
  ≥ 45 min = vitesse (Puzzle Rush si Chess.com, sinon Puzzle Storm Lichess), partie rapide + analyse
  si Rapide, parties courtes (3 ou 5 max) si Bullet/Blitz ; liens vers le 1er site choisi.
  Méthode convenue avec l'utilisateur (Lichess Blitz ~1040, Chess.com rapide ~750) : habitude
  « Son coup d'abord » contre la vision tunnel ; bilan prévu après 4 semaines (vers le 2026-12-14).
- **Bilan par variante (mes vraies parties)** : à l'import, chaque partie terminée est reliée à
  une fiche (`ficheJouee` : fiche choisie de ma couleur suivie le plus loin, ≥ 4 demi-coups ; en cas
  de sortie, la fiche attendue) → `progression-v1.parties` (une par partie) → `bilanFiches` : V/N/D,
  sorties, punitions ratées ; état « à revoir » (sortie, punition ratée, ou < 40 % des points sur 2+
  parties) / « solide » (2+ parties, ≥ 60 %, sans sortie). Affiché dans Apprendre (résumé, ligne par
  variante, ordre « ⚠ À revoir d'abord »).
  Sous chaque variante : « 🎮 Mes parties dans cette variante » (date, adversaire, résultat, coup où
  la partie quitte la fiche) et « ▶ Rejouer ma partie » (coups gardés, 120 demi-coups max, ouverts
  sur l'échiquier Moteur via `openGame` de TrainingPage).
  Dans la leçon (étape « Les coups ») : « 🎮 Comparer avec ma partie » (choix d'une de mes parties
  de la variante, bascule 📖 Théorie / 🎮 Ma partie sur le même échiquier, 1er écart entouré, ligne
  « Ma partie : X · théorie : Y » sous l'échiquier).
- **Simplification de l'Entraînement (2026-11-16)** : une seule porte d'entrée (routine du jour),
  « Séance du jour » supprimée ; réglages de S'entraîner / anti-trash repliés sous « Commencer » ;
  progression et autres modes repliés ; « Mes vraies erreurs » → « Positions de mes parties » ; « À
  revoir d'abord » → « Mes points faibles d'abord » ; fin de séance : « Refaire mes erreurs de la
  séance » ; une partie de la liste « Mes parties dans cette variante » ouvre la comparaison dans la
  leçon (plus de relecture sur la page Moteur depuis Apprendre).
- **Gestion du temps (2026-11-22)** : import Lichess avec `clocks=true` (centièmes, une entrée en
  trop pour le joueur tombé, ignorée), Chess.com et PGN collé par `[%clk]` + `TimeControl` ;
  `finTemps` ('moi'/'adversaire') d'après `status: outoftime`, `result: timeout` ou `Termination`.
  games-core : `tempsParCoup`, `analyseTemps` (moyenne par phase, 3 plus longues réflexions
  ≥ max(10 s, 8 % du temps initial), « coup simple » si perte Stockfish < 0,5, « perdue au temps
  avec l'avantage » si dernière éval ≥ +1), `bilanTempsParties`. Mes parties : résumé « ⏱ Mon
  temps sur ces N parties », badge « ⌛ au temps », section « ⏱ Mon temps » dans l'analyse ; « ♟ Voir » une
  longue réflexion : position avant le coup sur l'échiquier d'analyse (ramené à l'écran), temps passé et
  pendule avant le coup, « ▶ Analyser cette position sur l'échiquier » (Moteur, `openLine`).
  Routine : suivi du soir « Blitz perdus au temps » (`temps`, rempli à l'import s'il est vide) ;
  chrono des problèmes (`CHRONOS` 0/30/15 s, `routine-v1.chrono` ; temps écoulé = raté).
- **Se connecter avec Lichess (2026-11-22, `lichess-auth.js`)** : depuis fin 2026, l'export des
  parties Lichess répond 404 sans jeton. Connexion OAuth2 PKCE officielle (client_id `blitzrefute`,
  sans inscription ni secret, aucune permission demandée) : départ `connecter(retour)` (vérificateur
  dans `coach-echecs:lichess-oauth`, 15 min), retour `?code=&state=` traité au démarrage de main.js
  (`terminerConnexion` : POST /api/token, GET /api/account), jeton rangé dans `jeton-lichess` (secret,
  jamais exporté), pseudo + `lichessConnecte` dans `mes-parties`, adresse nettoyée → `#/parties`.
  Bandeau dans Mes parties (connecté / « Se déconnecter » = DELETE /api/token) et bouton dans ⚙.
- **Visite guidée (2026-11-22, `tour.js`)** : 6 étapes (routine, Apprendre, Répertoire, Mes parties,
  échiquier, ⚙), bulle fixée en bas, élément entouré (`.tour-cible`) et amené à l'écran, page changée
  par le hash. Lancée une fois après le PREMIER choix d'ouvertures (`coach-echecs:visite` =
  'a-faire' posé par choix.js, 'faite' à la fin ou « Passer ») ; les utilisateurs existants ne la
  voient pas ; « Revoir la visite guidée » dans ⚙.
- **Aide et contact (2026-11-22, `aide.js`)** : fenêtre `#dlg-aide` ouverte par ⚙ « ❓ Aide… » :
  8 questions fréquentes, contact, « 🐞 Signaler un problème » (message + diagnostic sans donnée
  personnelle : page, version, navigateur, écran, état du moteur) envoyé par `mailto:` si
  `config.json.supportEmail` existe (par défaut blitzrefute@gmail.com, boîte dédiée créée par
  l'utilisateur le 2026-11-23 ; variable de dépôt `SUPPORT_EMAIL` pour la changer), sinon copié.
- **Marques tierces (2026-11-23)** : Lichess / Chess.com cités seulement comme sources de données ou
  sites où jouer (jamais dans le nom, l'icône, le logo) ; aucune image de leurs marques. Mention
  « application indépendante, ni affiliée ni approuvée par Lichess ou Chess.com » en pied de page,
  sur l'accueil et dans la FAQ (9 questions). La page de contact de Lichess autorise l'usage
  commercial (« You are welcome to use Lichess for your activity, even commercial ») ; e-mail de
  confirmation envoyé par l'utilisateur (réponse à intégrer ici).
- **Finales essentielles (2026-11-23)** : `site/data/finales.js` (8 positions : escalier, R+D, R+T,
  opposition gagnante, carré, défense par l'opposition, Lucena, Philidor ; but mat / promotion /
  nulle, limite de coups, méthode écrite ; 3 gratuites) vérifiées par `scripts/verify-finales.mjs`
  (Stockfish profondeur 20 → `data/finales-verif.json`, `--check` en CI). `finales.js` (FinaleRunner,
  carte « ♚ 4. Finales essentielles » de l'Entraînement) : Stockfish joue l'adversaire (500 ms) ;
  après chaque coup, `finales-core.apresMonCoup` (seuils : gain ≥ +3 pour mat/promotion, ≥ −1,5
  pour nulle ; pat = raté) ; échec → coup conseillé ; indice = flèche ; progression
  `coach-echecs:finales-v1` (✔ réussie, ⭐ sans indice). Piège : Stockfish lite répond
  « bestmove (none) » sur R+D avec le roi noir en d5 (position remplacée ; le coup est annulé si
  le moteur ne répond pas).
- **Ma progression (2026-11-23, `#/progression`, `progression-page.js` / `progression-core.js`)** :
  page hors onglets (liens depuis l'Entraînement et Mes parties). Lichess : historique public
  `/api/user/{u}/rating-history` (sans jeton ; séries Blitz/Rapide/Bullet/Classique, évolution 30 et
  90 jours, record, courbe SVG sur 6 mois / 1 an / tout). Chess.com : `/pub/player/{u}/stats`
  (actuel, record, bilan) + courbe construite à partir des parties importées
  (`coach-echecs:classements-v1`, 600 max, rempli à chaque import). Routine sur 4 semaines (jours
  actifs, complets, moyennes problèmes / menaces / au temps, tendances) ; entraînement (variantes
  apprises, finales, positions corrigées).
- **Installation et sauvegardes (2026-11-23, `installation.js` / `installation-core.js`)** :
  état propre à l'appareil `coach-echecs:installation-v1` (jours de visite, premiereDonnee,
  derniereSauvegarde, refus ; jamais exporté, écrit seulement une fois des ouvertures choisies pour
  ne pas fausser la 1re visite). Bandeau en bas (jamais pendant la visite guidée ni sur une
  fenêtre ouverte), un seul à la fois : « 📲 Installe BlitzRefute » à partir du 2e jour de visite
  si non installée (téléphone, ou ordinateur avec invitation du navigateur), « Plus tard » = 14 j
  de calme, 3 refus max ; sinon « 💾 Pense à sauvegarder » (données depuis 7 j sans sauvegarde,
  puis tous les 30 j, 14 j sur iPhone non installé ; « Plus tard » = 7 j). Guide `#dlg-installer`
  (aussi ⚙ « 📲 Comment installer l'appli ») : étapes illustrées (icônes SVG dessinées) pour iPhone
  Safari, iPhone autre navigateur (copier l'adresse pour Safari), Android (bouton direct si
  `beforeinstallprompt`), ordinateur ; « Sauvegarder maintenant ». `navigator.storage.persist()`
  demandé si installée, après installation et à chaque sauvegarde. Fichier `blitzrefute-donnees-
  AAAA-MM-JJ.json` ; date de la dernière sauvegarde dans ⚙ Mes données.
- **Problèmes par thème (2026-11-23, `problemes-core.js`, carte « 🧩 5. » de l'Entraînement)** : 26
  thèmes Lichess (`angle` de /api/puzzle/next ; mix, pièce en prise et mat en 1 gratuits), joués
  avec PuzzleRunner (`onResultat`, `difficulty` fonction, `vus`). Classement propre à l'appli
  (`coach-echecs:problemes-v1` : départ 1200, Elo K=40 sur 20 problèmes puis 20, à partir de la
  difficulté publiée par Lichess ; jamais présenté comme un classement Lichess), difficulté demandée
  selon le classement (`difficultePour`), réussite par thème, thèmes faibles, historique par jour.
- **Partie contre Stockfish (2026-11-23, `partie-stockfish(-core).js`, carte « 🤖 6. »)** : 10
  niveaux — 1–6 « Skill Level » 0–12, 7–9 « UCI_LimitStrength + UCI_Elo » 1500/1900/2400 (échelle
  officielle Stockfish, PAS Lichess/Chess.com : ne jamais l'affirmer), 10 pleine force ; option
  `force` de `engine.analyze` (setoption seulement si changement, tout autre calcul repasse à pleine
  force). Couleur au choix/hasard, départ depuis la fin d'une fiche, reprendre, abandonner, fin de
  partie par chess.js, bilan par niveau (`coach-echecs:stockfish-v1`), analyse sur la page Moteur
  (`openSan` passé à TrainingPage). Niveaux 1–4 gratuits.
- **Synchronisation entre appareils (2026-11-23, `sync.js` / `sync-core.js`, Worker)** : code secret
  32 caractères (base32 Crockford, `coach-echecs:sync-cle`, secret jamais exporté) ; identifiant
  serveur = SHA-256(« blitzrefute-sync-id: » + code), contenu = « Mes données » chiffré AES-GCM
  (clé = SHA-256(« blitzrefute-sync-cle: » + code)), gzip si disponible. Worker : `/v1/sync/<id>`
  GET/PUT/DELETE sans code d'accès, Durable Object `SyncStore` (un par code, morceaux de 100 Ko,
  2 Mo max, version → 409 si périmée), limite `SYNC_PER_HOUR` par IP ; migration `v2` dans
  wrangler.toml. Client : état `coach-echecs:sync-v1` (version, empreinte, auto), décision au
  démarrage (rien/envoyer/recevoir/conflit), envoi au passage en arrière-plan, bandeau de conflit.
  **Inactif tant que le Worker n'est pas déployé** (apiUrl vide → la section le dit).
- **Version anglaise (2026-11-23, `i18n.js` / `i18n-en.js`)** : `coach-echecs:langue` ('fr' par
  défaut ; bouton EN/FR dans l'en-tête, ⚙ « Langue / Language »). En anglais : traduction à
  l'affichage (MutationObserver sur les textes et placeholder/aria-label/title ; `EXACT` ≈ 640
  textes + `MOTIFS` regex ; `[data-no-i18n]` pour exclure), `window.confirm` traduit, `sanFr` rend
  la notation anglaise, `nomFr` le nom ECO anglais. **Site entièrement bilingue (2026-11-24)** :
  textes des 269 fiches dans `site/data/repertoires/en/<id>.js` (famille, nom, plan, structure,
  cases, echanger, conserver, punition/piege = texte ; notation anglaise), contrôlés par
  `node scripts/verifie-en.mjs` (à lancer après tout ajout de fiche : une fiche sans traduction
  reste affichée en français), joints par repertoire.mjs (champ `en`) et appliqués par
  `donnees-langue.js` (filtrerData, accueil, choix, games) ; titres des répertoires et groupes :
  bloc EN de meta.js ; finales : champ `en` ; modules JS : `const L = (fr, en) => …` partout
  (texte français identique en 1er argument : les tests vérifient le français) ; formats de date
  'en-GB'/'en-US'. En anglais, la page est masquée jusqu'à la traduction (classe `i18n-attente`,
  sécurité 2,5 s). Restent en français volontairement : diagnostic envoyé au support, en-têtes
  PGN, payload de l'API Claude, chapitres de vidéos. La langue ne compte pas comme
  « utilisateur existant » ; une partie vide et les caches non plus.
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
  Lichess / Chess.com et licences (Stockfish GPLv3 ; pièces « Celtic » MIT depuis le 2026-11-23, auparavant cburnett GPL) à vérifier.

- **Décisions de vente (2026-10-26)** : prix **29 € accès à vie** ; paiement **Lemon Squeezy**
  (revendeur officiel : TVA, factures, clés de licence) ; statut micro-entreprise **en cours de
  création** par l'utilisateur → tout est préparé en mode test, la vente n'ouvre qu'une fois le
  statut obtenu. Plan : 1. comptes Cloudflare + Lemon Squeezy (utilisateur) ; 2. hébergement
  Cloudflare Pages + dépôt privé ; 3. vrai verrou (contenu Pro servi par le Worker contre une clé de
  licence Lemon Squeezy validée) — branche `licences-pro` ; 4. pages légales ; 5. achat test.

## 6. Stockage local (clés `coach-echecs:*`)

`partie:v1`, `partie-precedente:v1`, `reglages:v1` (dont theme/board/accent, eliteCamp), `entrainement`,
`revision-v1`, `progression-v1`, `mes-parties`, `analyses-v1`, `videos-perso`, `lichess-cache-v1`,
`youtube-v1`, `pro` (formule, propre à l'appareil), `installation-v1` (propre à l'appareil), `problemes-v1`, `stockfish-v1`, `langue`, `sync-v1` (propre à l'appareil), `mon-repertoire` (ouvertures choisies) ; **secrets** (jamais exportés) : `jeton-lichess`, `code-acces`, `cle-youtube`, `sync-cle`.

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

- Toujours lancer `npm test` et les tests Playwright avant de pousser.
- **NE PLUS PUBLIER SANS ACCORD (décision du 2026-11-23)** : un push sur `main` met le site en
  ligne (deploy.yml). L'utilisateur veut que l'appli reste privée tant qu'elle n'est pas finie :
  travailler et pousser sur une branche de travail, ne fusionner sur `main` que sur demande
  explicite. Le site publié reste figé à la version du 2026-11-23 (commit 9709e12) ; le guide
  d'installation (c6bdaaf) est sur `main` mais sa publication a été annulée — le prochain
  déploiement le publiera. Le nom « BlitzRefute » changera quand l'utilisateur aura déposé son nom
  officiel (création de la micro-entreprise).
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

## 8 bis. Où on en est (2026-11-23) et prochaines étapes

Feuille de route grand public (fichier texte envoyé à l'utilisateur, à jour) :
- FAIT : 1. Se connecter avec Lichess · 2. Routine pour chacun (3 questions) · 3. Visite guidée ·
  4. Aide / FAQ / contact (blitzrefute@gmail.com) · 5. Pièces « Celtic » (MIT) + icônes refaites ·
  6. E-mail à Lichess rédigé et ENVOYÉ par l'utilisateur (réponse attendue → l'ajouter ici) ·
  7. Mentions « application indépendante » · 8. Finales essentielles · 9. 4 nouvelles ouvertures
  (168 fiches) · 10. Ma progression. Aussi : gestion du temps (Mes parties), problèmes Lichess dans
  l'appli (niveau, chrono), révision « relire puis jouer », Mes variantes apprises, check-up complet.
- DÉCISION (2026-11-23, proposée par l'utilisateur après avis de Gemini, approuvée) : **rester en
  site web installable (PWA), pas d'App Store / Google Play pour l'instant** (pas de frais ni de
  commission de 15 %, paiement libre, mises à jour immédiates). Android (TWA, 25 $) plus tard si les
  ventes suivent ; iPhone seulement en cas de forte demande.
- FAIT (2026-11-23) : 11. Guide d'installation + protection des données (voir § 5,
  « Installation et sauvegardes »). Reste : synchronisation entre appareils (plus tard, serveur).
- FAIT (2026-11-23, branche de travail, PAS publié) : lot 1 de nouvelles ouvertures — Pirc (7 fiches),
  Alekhine (8), Catalane (8) ; 191 fiches. Lignes tactiques : Pirc 6.Fxh6?? (Byrne), Alekhine
  5…Cd7? Cxf7 (piège), 9…e6? Dxf7# (piège Alburt), 4.Fxf7+?? (punition), Catalane 6…Fb7? Fxb7.
  Traductions ajoutées dans nomFr (Ouverture catalane, Attaque autrichienne, quatre pions…).
- FAIT (2026-11-23, branche de travail, PAS publié) : lot 2 — Grünfeld (8), Najdorf (7), Dragon (7),
  Contre l'Anglaise 1.c4 e5 (5), Contre 1.Cf3 d5 (6), Écossaise +5, Contre le Londres +4 ; 233 fiches.
  Nouveau groupe de choix `autres` (« Contre 1.c4 / 1.Cf3 », 4e étape). Lignes tactiques : Grünfeld
  9.Dxd5? (punition), 5…Cb4? et 6…Dxd4? (pièges) ; Najdorf 7.Cf5? et 7.Cd5? (punitions), 7…Cxe4?
  (piège Sozin) ; Dragon 7…Cg4? contre Fe2 (piège), 7.Fe3? contre Fc4 (punition), 8…Cg4? Levenfish
  (piège) ; Anglaise 6.Fxb7?? ; Écossaise 3…f6 4…fxe5? (punition). nomFr : ~50 noms ajoutés.
- FAIT (2026-11-23, branche de travail, PAS publié) : lot 3 — Benoni / Benko (6), Bogo-indienne (5),
  Philidor (5), Viennoise (6, Blancs), Smith-Morra (6, Blancs), Italienne +2, Espagnole +3, Londres
  +3 ; 269 fiches. Tactique : Bogo …Df6? (Dxe4), Philidor 4…Fe7? (Dd5) et mat de Légal, Viennoise
  …Cxb5? Dxf7# et 5…Dxf2+?, Smith-Morra piège sibérien (h3? …Cd4, Dh2#) et 7…Dd6? (d5, Fb5+),
  Espagnole arche de Noé (8.Dxd4?). Feuille de route des ouvertures TERMINÉE (demande de
  l'utilisateur : « après c'est bon »).
- FAIT (2026-11-23, branche de travail, PAS publié) : problèmes par thème (classement propre),
  partie contre Stockfish (10 niveaux), synchronisation chiffrée (serveur à déployer), version
  anglaise de l'interface (contenu des fiches encore en français).
- FAIT (2026-11-24, branche de travail, PAS publié) : tout le site en anglais (fiches, leçons,
  explications, rapports, messages).
- Ensuite : déployer le Worker (synchro) ; vidéos des nouveaux répertoires — l'utilisateur veut l'appli d'entraînement la plus complète possible, moins
  chère que les grands sites, avec des options en plus ; problèmes par thème avec classement propre ;
  partie contre Stockfish à niveau réglable ; synchronisation ; version anglaise ; statistiques
  anonymes sans cookies.
- CÔTÉ UTILISATEUR (en attente) : création de la micro-entreprise (pas encore faite), nom de domaine,
  comptes Cloudflare et Lemon Squeezy ; ensuite : déménagement vers Cloudflare Pages + dépôt privé,
  vrai verrou Pro (licences Lemon Squeezy via le Worker), pages légales, achat test.
- Coaching de l'utilisateur : routine depuis le 2026-11-16 ; après 1 semaine, rapide > 90 % de
  précision et presque toutes gagnées ; problème = Blitz perdus au temps (conseils donnés : budget de
  temps, simplifier quand on est mieux, essayer le 5+3). Bilan prévu vers le 2026-12-14.
- Leçons de session : un fichier de test a été vidé par erreur en le lisant et l'écrivant dans la
  même instruction Python (`open(p,'w').write(open(p).read()…)` tronque le fichier avant la lecture) —
  toujours lire dans une variable d'abord. L'environnement redémarre parfois sans node_modules :
  `npm ci` (+ `cd worker && npm ci`) et recréer le lien PLAYWRIGHT_BROWSERS_PATH (chromium 1194 →
  chrome-headless-shell 1243) pour les tests ; scripts Node hors tests : require('playwright') global.

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
- Plus de fiches (168 aujourd'hui) ; commentaires de coups rédigés et vérifiés pour les cours.
- Vidéos des nouveaux répertoires : aucune pour Sicilienne, Française, Scandinave, Indienne du Roi,
  GD refusé (Noirs), Nimzo / Indienne de la Dame ; 24 (Italienne/Espagnole) et 8 (Londres/Anglaise)
  depuis la vidéothèque Lichess. Données Élite : seulement gd et ck (`elite: true`).
- Branche `licences-pro` (vrai verrou) écrite AVANT le grand public : à adapter aux 16 répertoires
  (fiches gratuites de meta.js) au moment de la vente.
- Analyse : variantes d'analyse (`analysisBranches`)
  séparées de la partie réelle ; réclamation de nulle / abandon dans l'interface.
- Option multithread (coi-serviceworker) seulement après test réussi sur le site publié et Safari iOS.
- Projet futur séparé (nouveau dépôt) : boutique en ligne de créations faites main (crochet,
  pulls, attrape-rêves, sacs) — site vitrine + paiement Stripe, éventuellement Etsy en parallèle.

# CLAUDE.md — BlitzRefute (ex-Coach Échecs) : règles stables du projet

À lire en premier. Ce fichier ne contient que les règles stables (stack, architecture, conventions,
commandes, comportement). **L'avancement, les tâches en cours, la prochaine étape, les choix récents et les
bugs connus sont dans `STATE.md`.** Ne pas recopier de code ici.

## Deux règles permanentes

1. **Au début d'une session ou après un `/clear`, lire toujours `STATE.md` avant de coder ou de proposer
   la suite.**
2. **À chaque nouvelle fonctionnalité, étape terminée ou nouveau projet, mettre à jour `STATE.md`**
   (avancement + suite prévue). Ici, ne garder qu'une courte mention vers `STATE.md`, sans détailler.

## Chantier en cours (détail et prochaine étape : `STATE.md`)

On passe toutes les ouvertures en revue, une par une : plus de fiches et de variantes dans chaque
ouverture (d'après les coups adverses les plus fréquents), puis les explications « 💡 Pourquoi ce coup ? »
pour chaque coup des fiches.

## Le projet en deux lignes

Application web d'entraînement aux ouvertures d'échecs (marque **BlitzRefute**), en français et en anglais,
grand public (club / Blitz ≈ 1000–1400 Elo), utilisable sur téléphone (installable, hors connexion) et sur
ordinateur. Site : https://miguelcerqueira1-cmyk.github.io/-coach-echecs/ — dépôt
github.com/miguelcerqueira1-cmyk/-coach-echecs (`main` = en ligne ; `donnees-elite` = données gérées par un
workflow). Les clés localStorage gardent le préfixe `coach-echecs:`.

## Principes non négociables

1. **Stockfish calcule, chess.js valide, Claude explique.** Aucune évaluation, variante, mat, statistique ou
   pourcentage ne vient d'un modèle de langage. Rien d'inventé : vidéos, comptes de joueurs, lignes
   tactiques, noms d'ouverture → toujours issus d'une source vérifiable ; si une donnée manque, l'afficher
   comme absente.
2. **Secrets** : la clé API Anthropic n'existe que dans les secrets du Worker Cloudflare (jamais dans le
   dépôt, le HTML ou le bundle). Jeton Lichess, code d'accès, clé YouTube, code de synchro restent sur
   l'appareil et ne sont jamais exportés. Ne jamais demander un secret en clair dans la conversation.
3. **Continuité de la partie** : le modèle `Game` est la source de vérité ; tout résultat moteur ou Claude
   obsolète (jeton `{gameId, branchId, revision, ply}` périmé) est ignoré.
4. Toute ligne tactique (punition, piège) est **vérifiée par Stockfish** (profondeur 18) avant publication.

## Stack technique

- Site **statique** (GitHub Pages), modules ES natifs, **aucun bundler** ; `scripts/build.mjs` produit `dist/`.
- **Stockfish 18 lite monothread** (paquet `stockfish`, WASM) dans un Web Worker ; **chess.js** pour les règles.
  Copiés dans `site/vendor/` et `site/engine/` par `npm ci` (postinstall).
- Appli installable (PWA : `sw.js`, `manifest.webmanifest`).
- **Cloudflare Worker** (`worker/`) : API Claude (désactivée sans clé), relais Opening Explorer, synchro
  chiffrée entre appareils, compteur de pages vues ; Durable Objects.
- Données : base ECO CC0 (lichess-org/chess-openings), API publiques Lichess / Chess.com, données « Élite »
  collectées par `.github/workflows/elite.yml`.
- Tests : `node:test` (unitaires) et **Playwright** avec vrai Stockfish (e2e) ; CI `deploy.yml` : vérification →
  e2e → Worker → Pages → contrôle du site publié.

## Architecture des dossiers

```
site/                         Site statique (GitHub Pages), modules ES, aucun bundler
  index.html                  Coquille + dialogues ; petit script de tête qui applique l'apparence avant affichage
  css/app.css                 Thèmes (variables CSS), styles d'échiquier, toutes les pages
  sw.js, manifest.webmanifest, icons/   Appli installable / hors connexion (sw.js complété par build.mjs)
  js/main.js        Contrôleur page Moteur : cycle coup → calcul → conseil → explication,
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
  js/repertoire-page.js Page Répertoire (rendu, recherche, classement, arbre, vidéos, export)
  js/repertoire-pgn.js        Export PGN (variantes, $2, commentaires)
  js/lines.js                 Lecture des lignes, index ECO, empreintes de fiche
  js/youtube.js               Recherche YouTube Data v3 (clé perso facultative, cache 7 j)
  js/elite.js                 Données Élite : chargement (raw GitHub → copie du site), lecture par FEN
  js/joueurs.js, joueurs-ui.js  Recherche par nom de joueur (index joueurs.json) et affichage en cartes
  js/training.js             Page Entraînement : accueil, cours, modules, tableau de progression, anciens modes
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
                              outils-fiches/ (trous Élite, contrôle des coups, punitions, écriture FR + EN),
                              elite.mjs / elite-core.mjs / elite-suivis.mjs (collecte Élite), verify-videos
data/chess-openings/          Base ECO CC0 (lichess-org/chess-openings)
data/verification.json        Résultats Stockfish (profondeur 18) par empreinte de fiche
tests/unit/ (13 fichiers)     node:test — npm test
tests/e2e/                    Playwright, vrai Stockfish : app, lichess, elite, games, training, pwa, pro, grand-public
.github/workflows/deploy.yml  vérification → tests e2e (image Playwright) → Worker → Pages → contrôle du site publié
.github/workflows/elite.yml   collecte Élite (≈ toutes les heures, complète le lundi) → branche donnees-elite
site/data/pourquoi/<rep>.json  « 💡 Pourquoi ce coup ? » d'un répertoire ({ cleCoup: [fr, en] })
site/data/repertoires/en/<id>.js  Textes anglais des fiches (mêmes ids)
```

## Conventions de code et de contenu

- **Langue** : textes en français d'abord, notation française (C, F, T, D, R), ton direct, chiffres toujours
  sourcés (« fréquence observée, pas une évaluation »). Anglais : `const L = (fr, en) => …` dans les modules
  (le français en 1er argument : les tests vérifient le français) ; textes des fiches dans
  `site/data/repertoires/en/<id>.js` (contrôle `node scripts/verifie-en.mjs`).
- **Design** : variables CSS sur `:root[data-theme]` / `:root[data-board]` ; thème par défaut « Nuit néon »
  (fond `#0b0d1e`, surfaces `#15183a`, accent `#9d8cff`, police Space Grotesk) ; flèches : vert = meilleur coup,
  orange = réponse, rouge = menace / coup fautif, bleu = statistique.
- **Téléphone d'abord** : aucun défilement horizontal (Chromium et WebKit/iPhone). Pièges Safari : un `<select>`
  ne rétrécit pas dans une grille (menus en pleine largeur) ; ne jamais recréer une case de recherche pendant
  la frappe ; listes de suggestions ≤ 12 ; tableaux larges → cartes.
- **Fiches de répertoire** (`site/data/repertoires/<id>.js`) : id unique préfixé (`repertoire.mjs` refuse les
  doublons), `rep`, famille, nom, badge (`theorie` / `piege` / `loufoque`), ligne SAN anglaise, plan, structure,
  punition / piège `{ ligne avec « ? » sur le coup fautif, texte, minCp? }`, cases, echanger, conserver, video.
  Seuils : punition ≥ +1,5 (ou `minCp`), piège ≤ −1,5, à profondeur 18. Une fiche peut commencer avant la
  racine du répertoire.
- **Après tout ajout / modification de fiche** : `npm run verify:repertoire`, `node scripts/repertoire.mjs`,
  `node scripts/verifie-en.mjs`, `node scripts/prolonge-lignes.mjs`, `node scripts/frequences.mjs`, puis les
  « Pourquoi » du répertoire.
- **« 💡 Pourquoi ce coup ? »** : `node scripts/pourquoi-faits.mjs <rep>` (faits chess.js + Stockfish), une
  phrase courte FR + EN par coup, sans aucun chiffre, chaque affirmation vérifiée sur la position ;
  « Stockfish préférait X » seulement si X est le meilleur coup calculé ; contrôle
  `node scripts/verifie-pourquoi.mjs` (en CI).
- **Vidéos** : seulement des vidéos trouvées telles quelles, jamais d'identifiant deviné ; `verifie: true`
  seulement après contrôle oEmbed (en CI) ; `&t=` seulement si l'auteur a publié ce chapitre.
- Marques tierces : Lichess / Chess.com cités seulement comme sources ou sites où jouer (jamais dans le nom,
  l'icône ou le logo).

## Stockage local (clés `coach-echecs:*`)

`partie:v1`, `partie-precedente:v1`, `reglages:v1` (dont theme/board/accent, eliteCamp), `entrainement`,
`revision-v1`, `progression-v1`, `mes-parties`, `analyses-v1`, `videos-perso`, `lichess-cache-v1`,
`youtube-v1`, `rush-v1`, `xp-v1`, `depart-v1`, `pro` (formule, propre à l'appareil), `installation-v1` (propre à l'appareil), `problemes-v1`, `stockfish-v1`, `langue`, `sync-v1` (propre à l'appareil), `mon-repertoire` (ouvertures choisies) ; **secrets** (jamais exportés) : `jeton-lichess`, `code-acces`, `cle-youtube`, `sync-cle`.
Ajouter ici toute nouvelle clé ; un secret n'est jamais exporté par « Mes données ».

## Commandes utiles

```
npm ci                         # dépendances + copie chess.js / Stockfish dans site/
npm test                       # tests unitaires (≈ 170)
npm run build                  # dist/ (COACH_API_URL=... pour l'API Claude)
node scripts/serve.mjs 4180 dist /coach-echecs/            # serveur local (port libre)
BASE_URL=http://localhost:4180/coach-echecs/ npx playwright test   # e2e (≈ 99), WITH_WEBKIT=1 en CI
npm run verify:repertoire      # après modification d'une fiche (recalcule data/verification.json)
node scripts/verify-repertoire.mjs --check
cd worker && npm ci && npm test
node scripts/elite.mjs --fixture tests/fixtures/elite --top 2 --now 2026-10-22T12:00:00Z --out /tmp/elite.json
gh workflow run elite.yml -R miguelcerqueira1-cmyk/-coach-echecs --ref main -f mode=complet
```

## Règles de comportement (pour Claude)

- Toujours lancer `npm test` **et** tous les tests Playwright avant de pousser.
- **Publication** : un push sur `main` met le site en ligne. Publier dès qu'un chantier est terminé et que tous
  les tests sont au vert : travailler sur la branche de travail, pousser sur `main` en avance rapide, vérifier
  **une fois** le résultat de deploy.yml et le dire à l'utilisatrice. Rien de non testé ou d'à moitié fini sur `main`.
- Messages de commit en français, terminés par les lignes d'attribution demandées par la session ; ne jamais
  écrire de nom ou d'identifiant de modèle ailleurs dans le dépôt.
- L'utilisatrice est sur téléphone, non développeuse : expliquer simplement, en français ; un chantier à la
  fois ; économiser les tokens (pas de surveillance CI continue, agents parallèles seulement pour les gros
  chantiers).
- GitHub n'affiche que 10 annotations par étape : regrouper les rapports en une annotation.
- Environnement cloud : youtube.com, api.chess.com, github.io et le Worker *.workers.dev sont bloqués (vérifier
  via la CI) ; lichess.org et raw.githubusercontent.com sont joignables ; l'Opening Explorer Lichess demande un
  jeton (absent ici). Si un port est pris, servir `dist/` sur un autre port et utiliser `BASE_URL`.
- Playwright local : si le Chromium attendu manque dans /opt/pw-browsers, pointer `PLAYWRIGHT_BROWSERS_PATH`
  vers un dossier où `chromium_headless_shell-<version attendue>/chrome-linux/headless_shell` est un lien vers le
  chrome-headless-shell installé (ne jamais lancer `playwright install`).

## Pièges connus (leçons des sessions)

- Lire un fichier dans une variable avant de le réécrire (un fichier de test a été vidé par
  `open(p,'w').write(open(p).read()…)`).
- L'environnement redémarre parfois sans node_modules : `npm ci` (+ `cd worker && npm ci`) et
  recréer le lien PLAYWRIGHT_BROWSERS_PATH (chromium 1194 → chrome-headless-shell 1243) ; le
  serveur local de test (`scripts/serve.mjs`) s'arrête parfois : 83 échecs d'un coup = le relancer.
- Tests WebKit/iPhone seulement en CI : pas de `grantPermissions` presse-papiers (casse WebKit) ;
  les tests « Android » doivent créer un contexte Android explicite.
- deploy-pages échoue parfois (« No artifacts named github-pages ») : second essai automatique.
- iPhone : appli installée et navigateur n'ont PAS la même mémoire ; navigateur intégré de l'appli
  Claude ≠ Chrome (pas connecté à GitHub) : faire ouvrir les liens dans Chrome.
- Ne jamais marquer `verifie: true` une vidéo non contrôlée par oEmbed (refusé à juste titre).
- Jeton Cloudflare affiché par erreur dans une capture → renouvelé ; rappeler de ne pas photographier
  les secrets.

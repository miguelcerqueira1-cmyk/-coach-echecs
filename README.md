# Coach Échecs

Un entraîneur d'échecs dans le navigateur, sur ordinateur et téléphone.
Après chaque coup réellement joué, il affiche le meilleur coup trouvé par **Stockfish**
et, si l'API est configurée, une explication rédigée par **Claude** à partir de ces calculs.

- **Stockfish calcule** (dans votre navigateur, rien n'est envoyé ailleurs pour le calcul).
- **chess.js valide** toutes les règles et tous les coups affichés.
- **Claude explique** les résultats du moteur, sans jamais les remplacer.

Pour l'entraînement, l'analyse et les parties où l'assistance est autorisée.

## Quatre pages

- **Moteur** : échiquier, conseil Stockfish après chaque coup réellement joué, et panneau
  « Coup optimal » qui sépare les sources : Stockfish (sur l'appareil), Lichess Cloud Eval,
  le coup au meilleur % de victoire dans les parties Lichess du niveau choisi
  (ex. Blitz autour de 1000), la base des maîtres, et « Élite blitz/rapide » (voir plus bas).
- **Répertoire** : Gambit Dame (Blancs) et Caro-Kann (Noirs) — 58 fiches avec code ECO, plan,
  structure, punition des coups adverses, pièges à éviter (tous vérifiés par Stockfish),
  statistiques (votre niveau, maîtres, Élite), évaluations Cloud Eval, et un arbre qui
  explore tous les coups réellement joués. Filtres rapides, recherche par nom, coup (Fg4 / Bg4) ou
  code ECO, section « Anti-trash Blitz », bouton « Tester cette ligne » (rejouée sur l'échiquier),
  vidéos YouTube en 7 langues et export PGN pour Lichess / Chess.com.
- **Entraînement** : l'application joue l'adversaire (coups tirés des vraies parties de votre
  niveau) ; vous devez trouver le coup de votre répertoire, vérifié par Stockfish.
- **Mes parties** : import de vos dernières parties Lichess et Chess.com, sortie du répertoire,
  analyse Stockfish coup par coup et bilan (moments décisifs, erreurs, trois pistes de travail).

**Élite blitz/rapide** : coups les plus joués, score, nombre de parties, répartition
Lichess / Chess.com et parties exemples (ouvrables sur l'échiquier) tirés des parties récentes
des 50 meilleurs joueurs blitz et rapide de chaque plateforme, limitées à 1.d4 d5 2.c4 et 1.e4 c6.
Ce sont des fréquences observées, pas une évaluation. Le fichier est régénéré chaque semaine par
GitHub Actions (`npm run elite` en local ; détails dans CLAUDE.md). Une position absente du jeu de
données est affichée comme absente.

Mode « Indice d'abord » (⚙) : indice → explication → coup, au lieu d'afficher directement le conseil.

## Utilisation

1. Ouvrez le site : <https://miguelcerqueira1-cmyk.github.io/-coach-echecs/>
2. « Nouvelle partie » : choisissez votre couleur (ou importez un PGN / une FEN).
3. À votre tour : une flèche verte montre le coup conseillé. Touchez « Confirmer » pour le jouer, ou jouez autre chose sur l'échiquier.
4. Au tour de l'adversaire : saisissez le coup **qu'il a réellement joué** (échiquier ou notation : `Cf3`, `Nf3`, `g1f3`…).
5. La partie est enregistrée sur l'appareil après chaque coup ; elle reprend après fermeture.

Pour activer les explications Claude : ⚙ Réglages → « Code d'accès personnel ».

## Mise en service

Voir [docs/CONFIGURATION.md](docs/CONFIGURATION.md) (comptes, secrets, coûts).

## Revenir à la version précédente

Chaque modification de la branche `main` republie le site automatiquement.

- **Le plus simple** : demandez à Claude Code « annule le dernier changement (git revert) et pousse-le ». La version précédente est republiée en quelques minutes.
- **Sans Claude Code** : sur GitHub, onglet **Actions** → workflow « Vérifier et publier » → cliquez sur une exécution **réussie** plus ancienne → bouton **Re-run all jobs**. Cela republie exactement cette version-là (site et API).

## Licence

GPL-3.0-or-later (Stockfish est sous GPLv3). Pièces : Colin M.L. Burnett (GPLv2+).

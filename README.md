# Coach Échecs

Un entraîneur d'échecs dans le navigateur, sur ordinateur et téléphone.
Après chaque coup réellement joué, il affiche le meilleur coup trouvé par **Stockfish**
et, si l'API est configurée, une explication rédigée par **Claude** à partir de ces calculs.

- **Stockfish calcule** (dans votre navigateur, rien n'est envoyé ailleurs pour le calcul).
- **chess.js valide** toutes les règles et tous les coups affichés.
- **Claude explique** les résultats du moteur, sans jamais les remplacer.

Pour l'entraînement, l'analyse et les parties où l'assistance est autorisée.

## Deux pages

- **Moteur** : échiquier, conseil Stockfish après chaque coup réellement joué, et panneau
  « Coup optimal » qui sépare trois sources : Stockfish (sur l'appareil), Lichess Cloud Eval,
  et le coup au meilleur % de victoire dans les parties Lichess du niveau choisi
  (ex. Blitz autour de 1000).
- **Répertoire** : Gambit Dame (Blancs) et Caro-Kann (Noirs) — 38 fiches avec code ECO, plan,
  structure, punition des coups adverses, pièges à éviter (tous vérifiés par Stockfish),
  statistiques et évaluations Lichess, et un arbre qui explore tous les coups réellement joués.

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

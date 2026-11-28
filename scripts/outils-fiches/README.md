# Outils pour compléter les fiches d'un répertoire (méthode des 27–28/11/2026)

À lancer depuis la racine du dépôt (`node scripts/outils-fiches/…`). `elite.json` : télécharger
`https://raw.githubusercontent.com/miguelcerqueira1-cmyk/-coach-echecs/donnees-elite/elite.json` dans un dossier temporaire.

- `trous.mjs <rep> <elite.json>` (variable `MIN`, défaut 8) : coups adverses joués dans les données Élite
  aux positions des fiches et absents des fiches, triés par nombre de parties.
- `pos.mjs <elite.json> "e4 e5 Nf3 …" …` : coups Élite joués dans une position (SAN anglais, sans numéros).
- `check.mjs <w|b> "1. e4 …" …` : chaque coup du camp indiqué comparé au meilleur coup (profondeur 14) ;
  signale les pertes ≥ 40 cp (règle : < 50 cp) et donne l'évaluation finale (profondeur 18).
- `greedy.mjs <w|b> "1. e4 …" …` : prises et échecs adverses « gourmands » qui donnent ≥ +1,5 au camp
  indiqué → candidats de punitions (à confirmer avec `scripts/probe-line.mjs`, puis verify:repertoire).
- `gen.py` (fonction `gen`) : écrit les fiches FR + EN ; `reuse.py` (fonction `reuse`) : recopie des fiches
  d'un autre répertoire (transpositions) avec de nouveaux identifiants.

Ensuite : `npm run verify:repertoire`, `node scripts/repertoire.mjs`, `node scripts/verifie-en.mjs`,
`node scripts/prolonge-lignes.mjs`, `node scripts/frequences.mjs <elite.json>`,
`node scripts/pourquoi-faits.mjs <rep>` (reprendre les textes existants par clé, rédiger le reste),
`node scripts/verifie-pourquoi.mjs`, `npm test`, Playwright.

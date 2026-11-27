# STATE.md — BlitzRefute : avancement, tâches en cours, suite prévue

Lu au début de chaque session (voir CLAUDE.md). Mis à jour à chaque fonctionnalité, étape ou projet
terminé. Les règles stables (stack, architecture, conventions, commandes) sont dans CLAUDE.md.

## En bref (mis à jour le 2026-11-27)

- **Chantier en cours** : compléter les fiches puis écrire les « 💡 Pourquoi ce coup ? », une ouverture à la fois,
  des plus jouées aux moins jouées. Faites : Caro-Kann, Gambit Dame, Sicilienne, Londres, Nimzo / Indienne de la
  Dame, Najdorf, Italienne, Espagnole, 1…e5, Française, GD refusé / Slave, Contre 1.Cf3, Indienne du Roi, Anglaise, Catalane, Scandinave (16 / 29). **Prochaine étape exacte :
  Pirc (pirc, 7 fiches ; 219 parties Élite)**, puis Contre l'Anglaise (219), Contre le Londres (189), Bogo (179), Écossaise (174)… L'utilisatrice autorise à enchaîner liste → fiches → Pourquoi → tests →
  publication sans attendre sa validation de la liste (résumé ensuite) ; elle donne son « continue » entre deux
  ouvertures.
- **Publication** : tout est sur `main` ; dernière publication : Scandinave (13 fiches ajoutées, 150 « Pourquoi ») ; avant : Catalane (10 fiches, 159), Anglaise (17 fiches,
  dont plusieurs transpositions vers le Gambit Dame, 237 « Pourquoi »), Indienne du Roi (17 fiches, 194), Contre 1.Cf3 (13 fiches,
  dont 9 reprises du GD refusé / Slave par transposition, 160 « Pourquoi »), GD refusé / Slave (16 fiches, 236, correction gdrn-londres 6…e5 au lieu de 6…Ff5 ??),
  Française (13, 211), 1…e5 (14, 256), en ligne.
- **En attente de l'utilisatrice** : décision sur la fiche Smith-Morra (sic-morra 6…Dc7, voir plus bas) — « on
  attend de voir » ; micro-entreprise (SIRET → pages légales) ; réponse de Lichess sur l'usage commercial.
- Pseudos de l'utilisatrice : Lichess **LeugiMC**, Chess.com **QG_Miguel**.

## 0. Contenu actuel (compteurs)

Application web **en français** d'entraînement aux ouvertures, **grand public** (joueurs de club /
blitz ~1000–1400 Elo). Chaque visiteur choisit ses ouvertures parmi **29 répertoires** : avec les
Blancs (Gambit Dame, Italienne, Espagnole, Londres, Écossaise, Catalane, Viennoise, Smith-Morra,
Anglaise), contre 1.e4 (Caro-Kann, 1…e5, Sicilienne, Française, Scandinave, Pirc, Alekhine, Philidor,
Najdorf, Dragon), contre 1.c4 / 1.Cf3 (Contre l'Anglaise 1.c4 e5, Contre 1.Cf3 Réti), contre 1.d4
(+ Grünfeld, Benoni / Benko, Bogo-indienne) (Indienne du Roi, GD refusé / Slave, Contre le
Londres, Hollandaise, Nimzo / Indienne de la Dame). **447 fiches** (2026-11-27) : Gambit Dame 31,
Caro-Kann 27 (répertoire historique du créateur), Italienne 21 (9 ajoutées le 2026-11-27 : Petrov, Philidor,
éléphant, letton — avant la racine 3.Fc4 —, 4.d3 Fc5, 4.d3 h6, Pianissimo …a5, 6.Fb5+ Fd7, 4.c3 d6), Espagnole 26 (13 ajoutées le 2026-11-27 : Petrov, Philidor, éléphant, letton
— reprises de l'Italienne —, Arkhangelsk, Møller, Cozio différée, 5…d6 6.c3 Fg4, échange …Df6, anti-Marshall …b4,
norvégienne, Smyslov, Cozio), Londres 21 (9 ajoutées le 2026-11-27 :
1…e6, 1…g6, 1…d6, 1…c6, 1…b6, 3…c5 direct, …Fd6, …Ch5, …cxd4), Écossaise 10,
Anglaise 25 (17 ajoutées le 2026-11-27 : après 4.d4 Ragozine / Semi-slave / …Cbd7 / Semi-Tarrasch / …dxc4, contre 1…e6
…Fe7 / …c6 (gambit Marshall) / …c5 / …a6 / …Cxd5, 1…c6, 1…g6, 1…b6, 1…f5, 2…Fb4, 2…Cc6, 2…e5), 1…e5 22 (14 ajoutées le 2026-11-27 : quatre Cavaliers 4.Fb5 et 4.d4, Deux Cavaliers 4.d3,
Italienne 4.d3 et 5.d4, partie du Fou, Berlinoise 4.d3 et 5.Te1, échange 4.Fxc6, 6.d3, partie du centre, viennoise 3.Fc4,
gambit écossais, Göring), Sicilienne 20 (système Taimanov ; 11 fiches ajoutées le 2026-11-27 d'après les coups adverses
les plus fréquents des données Élite), Française 21 (13 ajoutées le 2026-11-27 : 2.Cf3 (3 suites), 2.Cc3, échange 4.Fd3 / 4.c4, Tarrasch 4.Cgf3,
Steinitz 5.Cce2 / 6.dxc5, avance 6.Fe2, Alekhine-Chatard 6.h4, 2.b3, 2.d3 d5 3.De2), Scandinave 21 (13 ajoutées le 2026-11-27 : 4.Cf3 / 4.g3 / 5.Fc4 / 5.Fd2 / 6.Fd2 / 6.Ce5 / 7.Ce5, 3…Dd6 4.Cf3,
2…Cf6 3.Fb5+ / 3.Cf3 / 3.Cc3, 2.Cf3, 2.d3), Indienne du Roi 25 (17 ajoutées le 2026-11-27 : Makogonov, 6.h3, Gligoric 7.Fe3, Petrosian, baïonnette, 6.Fe3, 3.g3,
3.f3, fianchetto 6.Cc3, Sämisch 6.Fg5, et sans 2.c4 : 2.Cf3 g6 3.c4 / 3.Ff4 / 3.g3, Trompowsky, 2.Ff4 Cc3 e4 Dd2),
GD refusé / Slave 26 (16 ajoutées le 2026-11-27 : ordres 3.Cf3 / 2.Cf3, 5.Ff4, Catalane, Londres et Jobava, Semi-slave,
slave 4.e3 / 4.g3 / 4.Dc2 / 4.cxd5, 3.c3, 2.Fg5, Torre, 3.g3), Contre le Londres 8, Hollandaise 5, Nimzo / Indienne de la Dame 20 (12 ajoutées le 2026-11-27 : sans 2.c4 —
Trompowsky, Londres, Torre, Jobava, Colle — et 4.f3, 5.Fd2, 6.a3, 5.e4, Catalane 8.a4 / 7.Da4 / 7.Ce5), Pirc 7, Alekhine 8, Catalane 18 (10 ajoutées le 2026-11-27 : fermée 6…c6 / 6…a5 / 7…a5, 6…c5, 4…Fb4+, ouverte 5…Fb4+ / 5…Fd7 / 5…Cc6 /
5…Cbd7 / 7…b5), Grünfeld 8, Najdorf 18 (11 ajoutées le 2026-11-27 : Grand Prix, fermée,
Alapin, Morra refusé, 3.Cc3, 3.c3, 4.Dxd4, 3.Fc4, 6.f3, 6.g3, 6.Fe3 e5 7.Cf3),
Dragon 7, Contre l'Anglaise 5, Contre 1.Cf3 19 (13 ajoutées le 2026-11-27 : slave par 2.d4 Cf6 3.c4 c6 et ses suites, Londres, Torre, 3.c3, 3.g3,
2.e3, Réti 3.g3 et 3.e3 4.b3), Benoni / Benko 6,
Bogo-indienne 5, Philidor 5, Viennoise 6, Smith-Morra 6 ; toutes
vérifiées par Stockfish (profondeur 18). Objectif de l'utilisateur : le plus de répertoires et de
variantes possible (concurrencer les grands sites d'entraînement, prix plus bas, options en plus).
Utilisable sur téléphone (installable, hors connexion) et sur ordinateur, sans rien installer.

- Site publié : https://miguelcerqueira1-cmyk.github.io/-coach-echecs/
- Dépôt : github.com/miguelcerqueira1-cmyk/-coach-echecs (branche `main` ; branche de données
  `donnees-elite` gérée par un workflow).
- Pseudos de l'utilisateur : Lichess **LeugiMC**, Chess.com **QG_Miguel**.

## ★ Où on en est (2026-11-27) et prochaines étapes

**Tout est publié sur `main`** (site en ligne à jour au 2026-11-27, dernier deploy.yml réussi ; branche de
travail de la session des 26–27/11 : `claude/hopeful-davinci-99nq74`). Plus rien « en attente de publication ».

**Résumé de la session des 26–27/11 (tout en ligne)** : outil d'empreinte de code Pro ; badge « Claude :
erreur » corrigé ; « les plus jouées d'abord » pour toutes les ouvertures ; plan V1 étapes 1 à 5 (réglages
simplifiés, comparatif Gratuit/Pro, « 1 clic » + Continuer, Rush réfutations, pages légales + FAQ acheteur) ;
peaufinage (Entraînement en 4 tuiles, fiches repliées, sons/vibrations, bouton Lichess) ; meilleur coup
provisoire pendant le calcul ; test de départ ; XP / niveaux / objectif du jour / badges ; « 💡 Pourquoi ce
coup ? » Caro-Kann (ton et longueur VALIDÉS par l'utilisatrice le 2026-11-27 : « très propre »).

**Prochaine étape convenue** : compléter les fiches puis « 💡 Pourquoi ce coup ? » des 26 répertoires restants (gd, sicilienne, londres, nimzo-qid, najdorf, italienne, espagnole faits le 2026-11-27),
par lots, des plus jouées aux moins jouées (ordre conseillé : gd, sicilienne, londres, nimzo-qid, najdorf,
italienne, espagnole, e5-noirs, francaise, gdr-noirs…), même méthode que ck (voir le paragraphe dédié),
un répertoire = un fichier `site/data/pourquoi/<rep>.json`, contrôle `verifie-pourquoi.mjs`, tests, publication.
Ensuite au choix de l'utilisatrice : variantes perso, coups adverses non couverts, accueil plus vendeur +
pages publiques par ouverture (SEO). Puis partie B du plan (après la micro-entreprise).

**Fait et en ligne :**
- Contenu : 29 répertoires, 269 fiches vérifiées par Stockfish (profondeur 18), site bilingue FR/EN.
  Vidéos ≈ 210 fiches (160 ajoutées le 24/11, confirmées oEmbed) ; ≈ 50 fiches sans vidéo.
- Données Élite pour les 29 ouvertures (13 153 parties, deux camps pour la règle de couleur).
- Entraînement : routine du jour (profil 3 questions), leçons, S'entraîner (révision espacée),
  anti-trash, problèmes par thème (classement propre), partie contre Stockfish (10 niveaux), finales,
  positions de mes parties, Ma progression, Mes variantes apprises.
- Moteur : conseils Stockfish, 3 candidats, coup optimal, brouillon d'analyse, bilan, import/export.
- Appli installable (PWA, pas d'App Store pour l'instant), guide d'installation + encadré iPhone
  « emporte tes données », copier/coller des données, sauvegardes, visite guidée, aide/FAQ.
- Serveur Cloudflare (compte de l'utilisateur) : synchronisation chiffrée entre appareils (active ;
  l'utilisateur n'a qu'un appareil et ne s'en sert pas), compteur de pages vues. Statistiques :
  Cloudflare Web Analytics + ⚙ Avancé « Visites par page ». Explications Claude NON activées
  (payantes ; il faudrait ANTHROPIC_API_KEY + COACH_ACCESS_CODE dans les secrets GitHub).

**En attente / à régler :**
- **Code Pro : réglé (2026-11-26)** : l'utilisateur a retrouvé son code (empreinte déjà dans
  `CODE_HASHES`), à saisir sur chaque appareil (« J'ai un code d'accès »). Outil ajouté et publié :
  ⚙ Avancé « 🔑 Calculer l'empreinte d'un code » (code jamais enregistré ni envoyé) pour un futur
  nouveau code → l'utilisateur envoie SEULEMENT l'empreinte, à ajouter à `CODE_HASHES`.
- **Badge « Claude : erreur » (corrigé 2026-11-26)** : un code saisi dans ⚙ « Code Claude » + serveur
  en ligne sans ACCESS_CODE/ANTHROPIC_API_KEY (503 ou `claudeConfigured: false`) → `coach.serverOff`,
  badge masqué, explication gratuite (pas une panne).
- Réponse de Lichess à l'e-mail de l'utilisateur sur l'usage commercial (à intégrer quand reçue).
- « Les plus jouées d'abord » : publié pour toutes les ouvertures (2026-11-26).
- Bilan de la routine d'échecs de l'utilisateur vers le **2026-12-14** (4 semaines).

**Plan V1 vendable validé par l'utilisateur (2026-11-26), une étape à la fois, attendre son feu vert :**
A (sans entreprise) : 1. Réglages simplifiés ✅ ; 2. Gratuit vs Pro clair ✅ (`comparatif()` /
`comparatifHtml()` de pro.js, à garder fidèles aux verrous réels ; accueil + fenêtre Pro ; `teaser(e)` des
fiches verrouillées : piège/punition/leçon/vidéo/fréquence sans la solution ; offre unique 29 € à vie) ; 3. « 1 clic » et état
visible ✅ (`demande-entrainement.js` : demande {fiche|reelle|continuer} déposée puis prise par
TrainingPage.show / `executerDemande` ; `etatFiche` de progress.js → badge Nouvelle / En cours / ✅ Maîtrisée /
⚠ À revoir + « 📖 Apprendre » / « 🎯 S'entraîner » sur chaque fiche ; Mes parties « 🎯 Travailler mon
erreur » (Pro) ; Entraînement : carte « ▶ Continuer » en tête, `prochaineAction` = positions de mes
parties → positions dues → prochaine leçon → variantes faibles → Pro) ; 4. « Rush réfutations » ✅ (`rush-core.js` : record `coach-echecs:rush-v1`,
chrono 20 s − 1 s par réussite, 8 s min ; DrillRunner `rush` (kind trash) : 3 vies, positions mélangées
sans fin, réussite → suivante, erreur → punition montrée ; carte « ⚡ Rush » de l'Entraînement ; gratuit
sur les punitions des fiches gratuites, Pro sur toutes ; ligne dans le comparatif) ; 5. pages légales + FAQ acheteur ✅ (page `#/legal/{mentions|cgv|confidentialite}`,
`legal.js` ; infos éditeur dans `site/data/legal.js` : editeur, siret, adresse, mediateur VIDES → bandeau
« Version provisoire » tant que pas de SIRET ; rembourse14j: true = garantie 14 jours, CONFIRMÉE par
l'utilisateur le 2026-11-26 ; liens en pied de page et fenêtre Pro ; FAQ 13 questions dont abonnement, remboursement,
changement de téléphone, paiement sécurisé). À FAIRE RELIRE avant la vente. Après création de l'entreprise :
remplir data/legal.js, choisir un médiateur de la consommation. B (avec entreprise) : 6. Cloudflare Pages +
domaine + dépôt privé + licences ; 7. Lemon Squeezy + clé de licence + verrou serveur (mode test) ;
8. achat test, lancement. C (après) : choix du niveau au 1er lancement, contenus, Claude bonus Pro à quota,
langues. Écartés d'un commun accord : refonte i18n (tant que 2 langues), packs, contenu grand débutant
(cible ≈ 800 Elo et plus), Claude en V1.

**Peaufinage « priorité 1 » (2026-11-27, après comparaison aux concurrents : Chessable, Chessbook,
Chess.com/Chessly, Lichess/Listudy, Aimchess)** ✅ : 1. Entraînement en 4 tuiles (`data-tuile` /
`data-zone`, `prefs.zone` mémorisé, une section à la fois : apprendre / entrainer (S'entraîner, positions de
mes parties, progression) / reflexes (Rush, anti-trash) / plus (problèmes, finales, Stockfish, autres
modes)) ; numéros 1–6 retirés ; visite guidée → `.tuiles`. 2. Fiches du Répertoire repliées sur téléphone
(`tr.replie`, bouton `data-deplier`, boutons en ligne) ; sources dans « ℹ️ D'où viennent les chiffres ? ».
3. Sons et vibrations `sons.js` (Web Audio, sans fichier ; Board : son au nouveau coup, erreur sur
flashError ; réussite : ligne, anti-trash, Rush, problème, finale ; ⚙ `sons` / `vibrations`). 4. Plus de
« jeton requis » : `lien-lichess.js` → bouton « ♞ Se connecter avec Lichess pour voir les statistiques »
(Moteur, fiches, arbre, classement), clic global dans main.js. Prochaines idées proposées : badges/XP +
objectif quotidien, notifications de rappel (Web Push via Worker), test de départ en 2 min, « pourquoi ce
coup ? » rédigé une fois par coup, variantes perso, coups adverses non couverts, accueil avec captures,
pages publiques par ouverture (SEO).

**Priorité 2 (2026-11-27)** ✅ : **Test de départ** (`depart-core.js` : 5 positions « à nous de jouer » tirées
des fiches théorie les plus jouées (`entry.freq`), réparties entre ouvertures, autour du coup qui définit
la variante ; DrillRunner kind `examen` (un essai, bon coup montré) ; `coach-echecs:depart-v1` ; proposé
par « Continuer » tant qu'aucune leçon n'est suivie ; carte dans la tuile Plus ; bilan avec « 📖 Apprendre »
des variantes ratées). **XP / niveaux / objectif / badges** (`succes-core.js`, `coach-echecs:xp-v1` :
gains dans progress.js (ligne 10/2, drill 10/2, 1re leçon 20, erreur corrigée 15), problème 5, finale 15,
test 5 ; niveau n dès 50 × (n − 1)² XP ; objectif du jour 30/50/100 ; 15 badges calculés sur les vraies
données ; points de départ des anciens utilisateurs calculés une fois ; message passager `toast`).
Rappels par notification (Web Push) REPORTÉS : clés VAPID secrètes + tâche planifiée du Worker, iPhone
seulement appli installée — à faire avec le déménagement Cloudflare. Test e2e « Élite : bloc du Coup
optimal » parfois instable en suite complète locale (passe seul ; la CI relance une fois).

**« 💡 Pourquoi ce coup ? » (2026-11-27, essai Caro-Kann validé par l'utilisateur)** : explication courte (FR + EN)
de chaque coup des fiches, rédigée une fois (aucun coût à la lecture). Méthode : `node scripts/pourquoi-faits.mjs
<rep> > faits.json` (faits chess.js + Stockfish profondeur 16 : meilleur coup, écart ; un coup partagé par
plusieurs fiches = une seule clé `cleCoup(fen, uci)`), rédaction à partir de ces faits et du plan de la fiche,
fichier `site/data/pourquoi/<rep>.json` ({ clé: [fr, en] }), contrôle `node scripts/verifie-pourquoi.mjs` (en CI :
clé reliée à une fiche, ≤ 240 caractères, aucune évaluation chiffrée, coups de pièce cités légaux avant/après ou
présents dans une fiche de la position ; « Stockfish préférait X » seulement si c'est le meilleur coup calculé).
Affichage : leçon étape « Les coups » (`data-pourquoi`, `pourquoi.js`) et erreur dans S'entraîner (remplace le plan).
Fait : **ck 242 / 242** (ton validé), **gd 283 / 283**, **sicilienne 208 / 208**, **londres 209 / 209**, **nimzo-qid 220 / 220**, **najdorf 170 / 170**, **italienne 185 / 185**, **espagnole 224 / 224** (2026-11-27 ; 42 textes repris de
l'Italienne pour les coups communs), **e5-noirs 256 / 256** (81 textes repris de l'Italienne / Espagnole), **francaise 211 / 211**, **gdr-noirs 236 / 236**, **contre-reti 160 / 160**, **indienne-roi 194 / 194**, **anglaise 237 / 237**, **catalane 159 / 159**, **scandinave 150 / 150**. À faire : les 13 autres répertoires (suivant : pirc). Des fiches peuvent commencer
avant la racine du répertoire (ex. ita-petrov : 2…Cf6) : accepté par l'appli et les contrôles.
**Autorisation de l'utilisatrice (2026-11-27)** : pour ce chantier « fiches + Pourquoi », enchaîner liste des trous →
fiches → Pourquoi → tests → publication SANS attendre sa validation de la liste (lui résumer ensuite). Identifiants : repertoire.mjs
refuse désormais les doublons (cat-da4 existait déjà dans catalane : les fiches Catalane de nimzo-qid sont nq-cat-*). Le test e2e grand-public compte
les fiches du Londres (21, dont 20 verrouillées) : à mettre à jour si on en ajoute.
**Méthode convenue (2026-11-27) : compléter les fiches PUIS écrire les « Pourquoi », une ouverture à la fois.** Trous :
coups adverses fréquents des données Élite non couverts (script d'analyse de elite.json par position de l'arbre :
coups adverses absents des fiches, triés par nombre de parties), liste validée par l'utilisatrice avant d'écrire.
Pour chaque nouvelle fiche : lignes testées par probe-line, chaque coup « à nous » contrôlé (perte < 0,5 pion à
profondeur 14), pièges/punitions cherchés parmi les prises et échecs « gourmands » puis vérifiés (profondeur 18) ;
verify-repertoire, repertoire.mjs, verifie-en, prolonge-lignes, frequences (données Élite du jour), pourquoi.
Le jeton Lichess (statistiques au niveau 1000–1400) n'est pas disponible dans l'environnement cloud.
**Défaut connu (signalé le 2026-11-27, non corrigé)** : sic-morra 6…Dc7 permet 7.Cb5 ! Db8 8.Ff4 (avantage blanc net
selon Stockfish) ; 6…a6 est meilleur, mais le piège sibérien de la fiche suppose …Dc7 : à revoir avec l'utilisatrice. Le Gambit Dame ayant ses textes, le test e2e « Lignes » attend
« 💡 Pourquoi c4 ? » (et non plus le plan) après l'erreur volontaire. Conseils de rédaction : 1 phrase courte, le « pourquoi » (centre, développement, gain de temps,
clouage, rupture, plan de la fiche), jamais de chiffre ; vérifier chaque affirmation (une case « défendue »,
une pièce « attaquée ») sur la position ; le contrôle refuse les coups cités impossibles.

**Anciennes prochaines étapes (intégrées au plan ci-dessus) :**
1. Brouillons des pages légales (mentions, CGV, confidentialité), à compléter avec l'entreprise.
2. Vidéos pour une partie des ≈ 50 fiches restantes (méthode : § 9).
3. Plus de fiches pour les petits répertoires (Hollandaise, Bogo, Philidor, Contre l'Anglaise : 5) et
   commentaires coup par coup dans les leçons.
4. Vente : déménagement sur Cloudflare Pages + dépôt privé, vrai verrou Pro (licences Lemon Squeezy
   via le Worker ; branche `licences-pro` écrite avant le grand public, à adapter aux 29 répertoires),
   achat test. Idées plus tard : statistiques par fiche, Android (TWA) si les ventes suivent.

**Côté utilisateur :** micro-entreprise (pas encore créée ; guide pas à pas donné le 2026-11-26 :
formalites.entreprises.gouv.fr, gratuit, micro-entrepreneur ; si une micro-entreprise existe déjà, AJOUTER une
activité au lieu d'en créer une 2e ; ensuite envoyer nom, SIRET, adresse → `site/data/legal.js`, choisir un
médiateur de la consommation), nom officiel (« BlitzRefute » changera),
nom de domaine, compte Lemon Squeezy. Comptes déjà créés : Cloudflare (blitzrefute@gmail.com,
sous-domaine blitzrefute.workers.dev), GitHub miguelcerqueira1-cmyk (mot de passe à retrouver /
noter : l'utilisateur ne s'en souvenait plus le 24/11).

**Coaching de l'utilisateur :** routine depuis le 2026-11-16 ; Lichess Blitz ~1040, Chess.com rapide
~750 ; rapide > 90 % de précision ; problème principal = Blitz perdus au temps (conseils : budget de
temps, simplifier quand on est mieux, essayer le 5+3).

## 1. Ce que fait l'application aujourd'hui (4 pages, navigation par hash)

| Page | Contenu |
|---|---|
| `#/accueil` | Page publique (1re visite, logo) : marque, fonctions, ouvertures (fiches publiées / « bientôt »), formules Gratuit / Pro 29 €, « Choisir mes ouvertures ». |
| `#/ouvertures` | Choix en 4 étapes (Blancs, contre 1.e4, contre 1.d4, contre 1.c4 / 1.Cf3 — groupe `autres`), plusieurs ou aucun par étape, au moins un au total ; enregistré puis rechargement sur `#/repertoire`. Aussi depuis ⚙ « Mes ouvertures ». |
| `#/moteur` | Échiquier ; conseil Stockfish après chaque coup réellement joué (confirmer pour l'enregistrer) ; panneau « Coup optimal » (Stockfish local, Lichess Cloud Eval, meilleur % de victoire à mon niveau, coup des maîtres, coup de l'Élite) ; navigation ⏮◀▶⏭ et analyse des positions passées ; explication gratuite sans IA (ou Claude si configuré) ; mode « Indice d'abord » ; noms/Elo des joueurs au-dessus de l'échiquier ; « Jouer la suite jusqu'à la fin » (théorie des maîtres puis Stockfish) ; « Bilan de la partie » ; import/export PGN/FEN. |
| `#/repertoire` | Fiches des ouvertures choisies (269 au total) : ECO + nom, séquence, évaluation (Cloud Eval + vérif Stockfish), statistiques (mon niveau / maîtres / Élite), plan & structure, punition, piège, cases clés, vidéos. Filtres rapides, recherche (nom, coup FR/EN « 3…Fg4 », code ECO, **nom de joueur** → ses parties), « Classer » (plus jouées, meilleur score, meilleure éval), section « Anti-trash Blitz », « ▶ Tester cette ligne », arbre des coups (niveau/maîtres/Élite), « 🔴 Nouvelles parties du top », export PGN (étude Lichess / Chess.com). |
| `#/entrainement` | Accueil en parcours : **📖 1. Apprendre** (cours par fiche : présentation → coups un par un avec le nom officiel atteint et des commentaires factuels → à retenir, piège et punition **jouables coup par coup** sur l'échiquier → pratique guidée avec indices), **📚 2. S'entraîner** (lignes en répétition espacée : l'app joue l'adversaire, erreur → plan + bon coup, position remise en boucle), **⏱ 3. Réflexes anti-trash** (punition chronométrée 10/20/30 s ; un autre coup gagnant vérifié par Stockfish est accepté), **🎯 Positions de mes parties** (ex-« Mes vraies erreurs » : sorties de répertoire et punitions manquées de mes parties Lichess/Chess.com, à rejouer jusqu'à validation), **📊 progression** par variante, repliée (maîtrise %, série 🔥, sorties réelles ⚠). Point d'entrée : **📅 Ma routine du jour** en haut (a remplacé « Séance du jour »). « Autres modes » : partie contre l'adversaire (coups tirés de Lichess), positions isolées. |
| `#/progression` | « Ma progression » (hors onglets, liens depuis Entraînement et Mes parties) : courbes Lichess, classements Chess.com, routine sur 4 semaines, chiffres de l'entraînement. |
| `#/parties` | Import des dernières parties Lichess/Chess.com (automatique à l'ouverture si pseudos enregistrés, badge « Nouveau »), sortie du répertoire, analyse Stockfish coup par coup, courbe, bilan, **rapport détaillé écrit** (note, déroulement, bons coups, erreurs expliquées avec la suite du moteur, occasions manquées, à retenir, exercices). |

⚙ Réglages (simplifiés le 2026-11-26, étape 1 du plan V1) : en haut langue, aide, mes ouvertures,
conseils (niveau, mode d'aide), connexion Lichess, apparence, Mes données / synchro / installation ;
replié dans `#set-avance` « Avancé » : budget moteur, flèche adverse, règle de couleur Élite, jeton
Lichess, clé YouTube, code Claude (+ explication auto), visites, empreinte de code, API, restauration.


## 2. Détail des fonctionnalités et choix techniques (par date)


- **Stockfish 18 lite monothread** (stockfish.js 18.0.8, WASM 7,3 Mo), pleine force. WASM mis en
  cache (Cache Storage) et passé au Worker par `stockfish.js#<blob-url>` (le service worker reconstruit
  la réponse du script pour garder ce fragment). Multithread non activé (pas de COOP/COEP sur Pages).
- **3 coups candidats** (page Moteur) : MultiPV 3 sur le budget habituel (1 pendant la suite
  automatique, menaces et analyses de parties) ; lignes rejouées par chess.js, meilleur coup en tête,
  écart en pions ; flèches discrètes (`alt`) ; masqués en mode « Indice d'abord ».
- **Affichage progressif (2026-11-27)** : pendant le calcul (page Moteur), dès la profondeur 8 la ligne
  principale de Stockfish (multipv 1, hors bornes) est validée par `buildAdvice` → `state.analysis.provisoire`
  → flèche du meilleur coup provisoire + texte « meilleur coup provisoire X » ; le conseil final remplace.
  Budget par défaut inchangé (Standard 3 s) ; Rapide 1 s dans ⚙ Avancé. Multithread possible plus tard
  sur Cloudflare Pages (en-têtes COOP/COEP).
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
  quand le répertoire a des données, bascule « Ordre conseillé ». **Toutes les ouvertures depuis le
  2026-11-26** (291 fiches / 334 ont une fréquence ; données Élite rafraîchies le 27/11).
  Données figées : relancer `node scripts/frequences.mjs` pour les rafraîchir.
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
- **iPhone : appli installée ≠ navigateur (2026-11-24, vécu par l'utilisateur)** : l'appli ajoutée à
  l'écran d'accueil a sa propre mémoire et démarre vide. Corrections : import sans filtre `accept`
  (le fichier téléchargé par Chrome était grisé) ; « 📋 Copier mes données » / « 📥 Coller des
  données » dans ⚙ Mes données (`copierDonnees` d'installation.js, zone de collage si le
  presse-papiers est refusé) ; guide iPhone avec encadré « Avant d'installer : emporte tes données »
  (si données, non installée) ; appli installée ouverte sans ouvertures choisies → bandeau
  « Tu utilisais BlitzRefute dans ton navigateur ? » (mémorisé en sessionStorage seulement, pour ne
  pas créer de clé `coach-echecs:*`). deploy.yml : second essai de deploy-pages après 30 s
  (« No artifacts named github-pages » deux fois le 2026-11-24).
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
  **Active depuis le 2026-11-24** : Worker déployé sur le compte Cloudflare de l'utilisateur
  (`https://coach-echecs-api.blitzrefute.workers.dev`, sous-domaine `blitzrefute.workers.dev`) par
  deploy.yml avec les seuls secrets GitHub CLOUDFLARE_API_TOKEN (modèle « Modifier Cloudflare
  Workers », sans expiration, renouvelé une fois car affiché dans une capture) et
  CLOUDFLARE_ACCOUNT_ID ; ANTHROPIC_API_KEY / COACH_ACCESS_CODE absents → explications Claude
  désactivées (503), choix de l'utilisateur. Contrôle « Serveur en ligne » après publication.
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
- **Brouillon d'analyse (2026-11-24, `variante-core.js`, page Moteur)** : depuis une position
  consultée (◀), un coup joué sur l'échiquier ouvre un brouillon (`state.variante`, viewPly = sa
  base) ; bouton « 🧪 Brouillon » pour partir de la position affichée, même actuelle. Les deux camps
  jouent ; Stockfish analyse chaque position (MultiPV, jeton `brouillon-<id>`), « Essayer <coup> » ;
  ⏮◀▶⏭ et flèches du clavier naviguent dans le brouillon ; « Annuler » retire un coup du brouillon ;
  « Quitter le brouillon » / toute navigation dans la partie / changement de la partie le ferment.
  Jamais enregistré (mémoire seulement) ; `Game` jamais modifié. La nulle/l'abandon sur la page
  Moteur ont été écartés par l'utilisateur (pas d'adversaire réel).
- **Statistiques de visite (2026-11-24, `stats.js`)** : Cloudflare Web Analytics (compte Cloudflare
  de l'utilisateur, sans cookies) ; jeton public `analyticsToken` + `analyticsHost` dans config.json
  (build.mjs, variables `ANALYTICS_TOKEN` / `ANALYTICS_HOST` ; à changer lors du passage à un nom de
  domaine). Script chargé seulement sur ce nom d'hôte, jamais en local, sous Playwright
  (`navigator.webdriver`) ni avec Do-Not-Track / GPC. FAQ « Où sont enregistrées mes données ? »
  mentionne le compteur. Tableau de bord : Cloudflare → Web Analytics.
  **Pages vues par page (2026-11-24)** : Cloudflare ne gère pas le routage par « # » → comptage par
  notre Worker : `suivrePages` (stats.js) envoie `POST /v1/vue {p}` (sendBeacon) à chaque page,
  mêmes conditions ; Worker : `Gate.compterVue` (compteur `vues:AAAA-MM-JJ` par page, limite
  `VUES_PER_HOUR` par IP effacée chaque heure, 90 jours gardés), `GET /v1/vues?jours=N` (totaux
  publics, CORS du site). Affichage : ⚙ Réglages → Avancé → « 📊 Visites par page ».
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


## 3. Grand public : choix des ouvertures, Élite


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
- Élite : **toutes les ouvertures depuis le 2026-11-24** (`elite: true` partout dans meta.js).
  Format 3 de elite.json : une position peut appartenir à plusieurs ouvertures (index FEN → liste) ;
  ouverture d'une partie = la plus précise atteinte dans les 16 premiers demi-coups (racine la plus
  longue) ; règle de couleur pour les DEUX camps (`c` = bits 1 Blancs / 2 Noirs tenus par le top,
  colonnes [cw,cd,cb,kw,kd,kb]) ; `lookupElite(..., { camp, side })` avec la couleur du répertoire
  (fiche / arbre) ou de la partie (Moteur) ; fichiers v2 encore lus (un seul camp). maxBytes 3 Mo.
  Tests unitaires anciens restreints à gd + ck (`configurerRepertoires`). Après publication :
  collecte complète (`elite.yml`, mode complet) pour remplir les nouvelles ouvertures. Résultat de
  la 1re collecte complète (2026-11-24) : 13 153 parties (Lichess 5 863, Chess.com 5 947, tournois
  1 343), 2,7 Mo, `minPositionGames` relevé à 7 pour tenir sous 3 Mo ; peu de parties pour Grünfeld
  (6), Smith-Morra (51), Hollandaise (72), Dragon et Benoni (80) ; beaucoup pour Sicilienne (1 570),
  Londres (1 197), GD (1 181), Nimzo (947), Caro-Kann (865), Najdorf (843).
- **Ajouter des fiches à un répertoire** : écrire dans `site/data/repertoires/<id>.js` (même format
  que gd.js : id unique préfixé, `rep: '<id>'`, famille, nom, badge, ligne SAN anglaise, plan,
  structure, punition/piège `{ ligne avec « ? » sur le coup fautif, texte }`, cases, echanger,
  conserver, video), désigner une fiche gratuite dans `meta.js` (`gratuites`), puis
  `npm run verify:repertoire` (Stockfish profondeur 18, met à jour data/verification.json),
  `node scripts/repertoire.mjs`, `npm test`.


## 4. Formule Gratuit / Pro et décisions de vente


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


## 5. Reste à faire / idées

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
- **Explications Claude** : inactives tant que ANTHROPIC_API_KEY et COACH_ACCESS_CODE ne sont pas
  ajoutés aux secrets GitHub (les secrets Cloudflare existent déjà) — payant à l'usage, décision de
  l'utilisateur ; l'explication gratuite fonctionne sans.
- Élite : le workflow planifié est désactivé par GitHub après 60 jours sans commit sur `main`.
- Plus de fiches (269 aujourd'hui) ; commentaires de coups rédigés et vérifiés pour les cours.
- **Vidéos des nouveaux répertoires (2026-11-24)** : 160 fiches de 27 répertoires complétées par
  recherche web (`scripts/ajout-videos-2026-11-24.mjs`, vidéos de présentation par ouverture + vidéos
  ciblées par famille), confirmées par oEmbed en CI (workflow « Chapitres » lancé sur la branche,
  `verify-videos.mjs --json` → `scripts/videos-confirmees-2026-11-24.json` : vrai titre et vraie
  chaîne, 0 morte) avant de passer `verifie: true`. Méthode à réutiliser : ajouter avec
  `chaine: null, verifie: false`, lancer le workflow sur la branche, reporter, puis publier.
  La vidéothèque Lichess est derrière une protection anti-robots (inaccessible d'ici).
  Restent sans vidéo ≈ 50 fiches (déviations, coups loufoques, Slave/systèmes sans c4 des Noirs,
  Indienne de la Dame, anti-siciliennes rares, Deux Cavaliers, Steinitz…).
- Branche `licences-pro` (vrai verrou) écrite AVANT le grand public : à adapter aux 16 répertoires
  (fiches gratuites de meta.js) au moment de la vente.
- Analyse : variantes d'analyse (`analysisBranches`)
  séparées de la partie réelle ; réclamation de nulle / abandon dans l'interface.
- Option multithread (coi-serviceworker) seulement après test réussi sur le site publié et Safari iOS.
- Projet futur séparé (nouveau dépôt) : boutique en ligne de créations faites main (crochet,
  pulls, attrape-rêves, sacs) — site vitrine + paiement Stripe, éventuellement Etsy en parallèle.

## 6. Détails conservés de l'ancien CLAUDE.md (marque, design, historique)

**Marque : BlitzRefute** (depuis le 2026-10-26) — « L'encyclopédie interactive et l'arme fatale pour
maîtriser tes ouvertures et détruire les pièges en Blitz. » Les clés localStorage gardent le préfixe
`coach-echecs:` (données des utilisateurs conservées).

Design détaillé :
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

Historique de la règle de publication :
- **PUBLICATION (décision du 2026-11-24, remplace celle du 2026-11-23)** : un push sur `main` met le
  site en ligne (deploy.yml). L'utilisateur autorise désormais à **publier dès qu'un chantier est
  terminé**, à condition que `npm test` et tous les tests Playwright soient au vert : travailler sur
  la branche de travail, puis pousser sur `main` (avance rapide), vérifier une fois le résultat de
  deploy.yml et le dire à l'utilisateur. Rien de non testé ou d'à moitié fini sur `main`.
  Publications du 2026-11-24 : site bilingue 29 répertoires, brouillon d'analyse, vidéos,
  statistiques, corrections iPhone, serveur Cloudflare (synchro), pages vues, Élite toutes ouvertures. Le nom « BlitzRefute » changera quand l'utilisateur aura déposé son nom

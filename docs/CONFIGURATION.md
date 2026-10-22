# Mise en service (sans rien installer sur votre ordinateur)

Tout se fait dans le navigateur. Aucun secret ne doit être écrit dans une conversation,
un fichier ou un message : uniquement dans les champs « Secrets » prévus.

## 0. Le site sans Claude (aucun compte payant)

Le site, l'échiquier et Stockfish fonctionnent dès que le dépôt est publié. Seules les
explications Claude nécessitent les étapes 1 à 3.

**Activer GitHub Pages (une seule fois)** : dépôt sur GitHub → **Settings** → menu de
gauche **Pages** → rubrique « Build and deployment », champ **Source** : choisir
**GitHub Actions**. (Pas de bouton « Save » : le choix est enregistré immédiatement.)
Puis onglet **Actions** → « Vérifier et publier » → **Run workflow** → **Run workflow**.

Le dépôt doit être **public** pour GitHub Pages gratuit (le code est visible, mais il ne
contient aucun secret).

## 1. Clé API Anthropic

1. Allez sur <https://console.anthropic.com> → **Sign up** (ou **Log in**).
2. Menu **Settings** → **Billing** → **Buy credits** : achetez un petit montant (5 $ minimum).
   Optionnel mais conseillé : **Settings → Limits** → fixez une limite de dépense mensuelle.
3. Menu **API keys** → **Create Key** → nom : `coach-echecs` → **Create**.
4. Copiez la clé affichée (elle commence par `sk-ant-`) : elle ne sera plus jamais réaffichée.
   Collez-la directement à l'étape 4, nulle part ailleurs.

## 2. Compte et jeton Cloudflare

1. <https://dash.cloudflare.com/sign-up> → créez le compte (offre **Free**, aucune carte requise).
2. Dans le menu de gauche, ouvrez **Workers & Pages** une première fois. Si Cloudflare
   propose de choisir un sous-domaine `workers.dev`, acceptez-le (c'est l'adresse de votre API).
3. **Identifiant de compte** : sur la page **Workers & Pages**, à droite, « Account ID » →
   bouton de copie. (Ce n'est pas un mot de passe, mais on le range aussi dans les secrets.)
4. **Jeton** : icône du profil (en haut à droite) → **My Profile** → **API Tokens** →
   **Create Token** → **Create Custom Token** → **Get started** :
   - *Token name* : `coach-echecs-deploiement`
   - *Permissions* : une seule ligne : **Account** · **Workers Scripts** · **Edit**
   - *Account Resources* : **Include** · *votre compte*
   - *Client IP Address Filtering* et *TTL* : laisser vides
   - **Continue to summary** → **Create Token** → copiez le jeton affiché.

   Si le premier déploiement échoue avec une erreur d'autorisation Cloudflare, recréez
   le jeton avec le modèle prêt à l'emploi **Edit Cloudflare Workers** (bouton **Use template**),
   restreint à votre compte : il ajoute quelques permissions dont wrangler a parfois besoin.

## 3. Votre code d'accès personnel

Inventez une phrase d'au moins 12 caractères (par exemple 4 ou 5 mots sans rapport entre
eux). Elle protège l'API : sans elle, personne ne peut consommer vos crédits. Vous la
saisirez une fois dans l'application (⚙ Réglages), elle restera mémorisée sur l'appareil.

## 3 bis. Jeton Lichess (statistiques de parties réelles)

L'Opening Explorer de Lichess exige désormais un jeton. Un jeton **sans aucune permission**
suffit : il ne permet ni de jouer, ni de lire vos messages, ni de modifier votre compte.

1. Connectez-vous sur <https://lichess.org> (compte gratuit).
2. Ouvrez <https://lichess.org/account/oauth/token/create>.
3. *Description* : `coach-echecs`. **Ne cochez aucune case** de permission.
4. **Create** → copiez le jeton (`lip_…`).

Deux façons de l'utiliser (une seule suffit) :
- **Sur l'appareil** : ⚙ Réglages → « Jeton Lichess personnel ». Le navigateur interroge
  directement Lichess.
- **Par le relais Cloudflare** (recommandé si l'API Claude est configurée) : secret GitHub
  `LICHESS_TOKEN` ci-dessous. Le jeton reste sur le serveur et les réponses sont mises en cache.

Cloud Eval (évaluations Stockfish de Lichess) ne demande aucun jeton.

## 3 ter. Clé YouTube (facultatif : liste des vidéos en 7 langues)

Sans clé, le bouton « 🎬 Vidéos » ouvre une recherche YouTube dans la langue choisie.
Avec une clé gratuite, la liste (titre, chaîne, durée, vues) s'affiche dans l'application.
Quota gratuit : environ 100 recherches par jour (résultats gardés 7 jours sur l'appareil).

1. Ouvrez <https://console.cloud.google.com> (compte Google) → créez un projet `coach-echecs`.
2. « API et services » → « Bibliothèque » → **YouTube Data API v3** → **Activer**.
3. « Identifiants » → « Créer des identifiants » → **Clé API**.
4. Modifiez la clé : *Restrictions d'application* → **Sites web** →
   `https://miguelcerqueira1-cmyk.github.io/*` ; *Restrictions d'API* → YouTube Data API v3.
5. Dans l'application : ⚙ Réglages → « Clé API YouTube Data v3 » → Enregistrer.
   Elle reste sur l'appareil (ne la collez jamais dans une conversation).

## 4. Enregistrer les secrets dans GitHub

Dépôt → **Settings** → **Secrets and variables** → **Actions** → onglet **Secrets** →
**New repository secret**, quatre fois (nom exact, puis valeur, puis **Add secret**) :

| Nom exact | Valeur |
|---|---|
| `ANTHROPIC_API_KEY` | la clé `sk-ant-…` (étape 1) |
| `CLOUDFLARE_API_TOKEN` | le jeton Cloudflare (étape 2.4) |
| `CLOUDFLARE_ACCOUNT_ID` | l'identifiant de compte (étape 2.3) |
| `COACH_ACCESS_CODE` | votre code d'accès (étape 3) |
| `LICHESS_TOKEN` | facultatif : jeton Lichess (étape 3 bis), active le relais |

Facultatif, onglet **Variables** → **New repository variable** :

| Nom | Effet | Par défaut |
|---|---|---|
| `CLAUDE_MODEL` | modèle utilisé (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`) | `claude-opus-5-5` |
| `DAILY_LIMIT` | nombre maximal d'explications par jour | `100` |

Ensuite : onglet **Actions** → « Vérifier et publier » → **Run workflow**. Quand tout est
vert, ouvrez le site → ⚙ → saisissez le code → **Tester la connexion**.

## Coûts réels

| Service | Coût |
|---|---|
| GitHub (dépôt public, Pages, Actions) | 0 € |
| Cloudflare Workers, offre Free (100 000 requêtes/jour) | 0 € |
| Stockfish (calcul dans votre navigateur) | 0 € |
| API Lichess (Cloud Eval, Opening Explorer) | 0 € |
| API Anthropic | à l'usage, crédits prépayés |

Estimation API (tarifs publics au moment de l'écriture, par million de jetons
entrée / sortie) : une explication représente environ 2 000 jetons envoyés et 300 à
900 jetons produits (réflexion comprise).

- `claude-opus-5-5` (4 $ / 20 $) : environ 0,01 à 0,025 $ par explication, soit
  environ 0,40 à 1 $ pour une partie de 40 coups avec explication automatique.
- `claude-sonnet-5-5` (2 $ / 10 $) : environ moitié moins.
- `claude-haiku-5-5` (0,10 $ / 0,50 $) : environ 40 fois moins.

Avec le plafond par défaut (100 explications/jour), la dépense maximale est d'environ
2,50 $ par jour avec Opus. Ces chiffres sont des estimations, pas des mesures : la
consommation réelle s'affiche dans la console Anthropic (**Usage**). Désactiver
« Explication automatique » (⚙) réduit fortement les appels.

## Changer le code d'accès ou la clé

Modifiez le secret dans GitHub (**Update**), puis relancez le workflow. Sur l'appareil :
⚙ → « Effacer le code de cet appareil », puis saisissez le nouveau.

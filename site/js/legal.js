// Pages légales (#/legal, #/legal/cgv, #/legal/confidentialite) : mentions légales, conditions de
// vente, confidentialité. Textes rédigés d'après le fonctionnement réel de l'appli (données sur
// l'appareil, services tiers) ; informations de l'éditeur dans data/legal.js. Brouillon tant que le
// SIRET n'est pas renseigné. À faire relire par un professionnel avant l'ouverture de la vente.
import { LEGAL } from '../data/legal.js';
import { langue } from './i18n.js';

const L = (fr, en) => (langue() === 'en' ? en : fr);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const v = (x) => (x ? esc(x) : `<em class="muted">${L('à compléter à la création de l’entreprise', 'to be completed when the business is registered')}</em>`);

const SECTIONS = ['mentions', 'cgv', 'confidentialite'];

function mentions() {
  const e = LEGAL;
  return `<h2>${L('Mentions légales', 'Legal notice')}</h2>
  <h3>${L('Éditeur', 'Publisher')}</h3>
  <p>${L('BlitzRefute est édité par', 'BlitzRefute is published by')} ${v(e.editeur)}, ${esc(L(e.statut, 'Sole trader (French micro-enterprise)'))}.<br>
  SIRET : ${v(e.siret)}<br>${L('Adresse', 'Address')} : ${v(e.adresse)}<br>${L('Contact', 'Contact')} : <a href="mailto:${esc(e.email)}">${esc(e.email)}</a><br>
  ${L('Directeur de la publication', 'Publication director')} : ${v(e.editeur)}.</p>
  <h3>${L('Hébergement', 'Hosting')}</h3>
  <p>${L('Site', 'Website')} : GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, ${L('États-Unis', 'USA')}.<br>
  ${L('Serveur (synchronisation, compteur de visites)', 'Server (sync, visit counter)')} : Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, ${L('États-Unis', 'USA')}.</p>
  <h3>${L('Propriété intellectuelle et licences', 'Intellectual property and licences')}</h3>
  <p>${L('Les textes, fiches, leçons et la présentation de BlitzRefute sont protégés ; toute reproduction sans accord est interdite. Composants tiers utilisés selon leur licence : moteur Stockfish (GPL v3, code source disponible sur stockfishchess.org), chess.js (BSD), pièces « Celtic » de Maurizio Monge (MIT), noms d’ouvertures de la base lichess-org/chess-openings (CC0), problèmes d’échecs de la base publique Lichess (CC0).', 'BlitzRefute’s texts, lines, lessons and layout are protected; reproduction without permission is prohibited. Third-party components used under their licence: Stockfish engine (GPL v3, source code at stockfishchess.org), chess.js (BSD), “Celtic” pieces by Maurizio Monge (MIT), opening names from lichess-org/chess-openings (CC0), chess puzzles from the public Lichess database (CC0).')}</p>
  <p>${L('BlitzRefute est une application indépendante, ni affiliée ni approuvée par Lichess ou Chess.com. Ces noms sont cités uniquement comme sources de données ou sites où jouer.', 'BlitzRefute is an independent app, neither affiliated with nor endorsed by Lichess or Chess.com. These names are cited only as data sources or places to play.')}</p>`;
}

function cgv() {
  const e = LEGAL;
  return `<h2>${L('Conditions générales de vente', 'Terms of sale')}</h2>
  <h3>1. ${L('Objet', 'Purpose')}</h3>
  <p>${L(`Les présentes conditions régissent l’achat de <strong>BlitzRefute Pro</strong>, accès à vie au contenu complet de l’application (toutes les variantes, leçons et modes d’entraînement réservés à Pro), vendu par ${v(e.editeur)} (SIRET ${v(e.siret)}).`, `These terms govern the purchase of <strong>BlitzRefute Pro</strong>, lifetime access to the app’s full content (all lines, lessons and Pro-only training modes), sold by ${v(e.editeur)} (SIRET ${v(e.siret)}).`)}</p>
  <h3>2. ${L('Prix et paiement', 'Price and payment')}</h3>
  <p>${L(`Prix : <strong>${esc(e.prix)} TTC</strong>, payé une seule fois, sans abonnement.${e.tvaNonApplicable ? ' TVA non applicable, art. 293 B du CGI (pour la part de l’éditeur).' : ''} Le paiement est traité par notre revendeur <strong>Lemon Squeezy</strong> (Merchant of Record), qui encaisse le paiement, émet la facture et applique la TVA du pays de l’acheteur le cas échéant. BlitzRefute n’a jamais accès à vos données bancaires.`, `Price: <strong>${esc(e.prix)} incl. taxes</strong>, paid once, no subscription. Payment is processed by our reseller <strong>Lemon Squeezy</strong> (Merchant of Record), which collects the payment, issues the invoice and applies the buyer’s local VAT where applicable. BlitzRefute never has access to your bank details.`)}</p>
  <h3>3. ${L('Livraison et activation', 'Delivery and activation')}</h3>
  <p>${L('Après paiement, vous recevez par e-mail une clé de licence, à saisir dans l’application (fenêtre Pro → « J’ai un code d’accès ») sur chacun de vos appareils personnels. L’accès est immédiat.', 'After payment you receive a licence key by e-mail, to enter in the app (Pro window → “I have an access code”) on each of your personal devices. Access is immediate.')}</p>
  <h3>4. ${L('Durée de l’accès', 'Duration of access')}</h3>
  <p>${L('« À vie » signifie : pendant toute la durée d’exploitation de BlitzRefute, mises à jour et nouvelles variantes comprises, sans paiement supplémentaire. En cas d’arrêt définitif du service, les utilisateurs seront prévenus au moins 3 mois à l’avance par un message dans l’application.', '“Lifetime” means: for as long as BlitzRefute is operated, updates and new lines included, with no further payment. If the service is permanently discontinued, users will be notified at least 3 months in advance by a message in the app.')}</p>
  <h3>5. ${L('Droit de rétractation et remboursement', 'Right of withdrawal and refunds')}</h3>
  <p>${L('BlitzRefute Pro est un contenu numérique fourni immédiatement. Conformément à l’article L221-28 13° du Code de la consommation, en demandant l’accès immédiat lors du paiement, vous renoncez expressément à votre droit de rétractation de 14 jours.', 'BlitzRefute Pro is digital content supplied immediately. Under article L221-28 13° of the French Consumer Code, by requesting immediate access at checkout you expressly waive your 14-day right of withdrawal.')}
  ${e.rembourse14j ? L(' <strong>Garantie « satisfait ou remboursé » :</strong> nous remboursons néanmoins, sans justification, toute demande faite dans les 14 jours suivant l’achat, par e-mail à l’adresse ci-dessous.', ' <strong>Money-back guarantee:</strong> we nevertheless refund, with no questions asked, any request made within 14 days of purchase, by e-mail to the address below.') : ''}</p>
  <h3>6. ${L('Fonctionnement et limites', 'How it works and limits')}</h3>
  <p>${L('BlitzRefute fonctionne dans un navigateur récent ou installé sur l’écran d’accueil. Vos données d’entraînement restent sur votre appareil : pensez à les sauvegarder (⚙ Réglages → Mes données). Les évaluations proviennent du moteur Stockfish ; certaines fonctions utilisent des services tiers (Lichess, Chess.com) dont la disponibilité ne dépend pas de nous. BlitzRefute est un outil d’entraînement, à utiliser uniquement là où l’assistance est autorisée (jamais pendant une partie en cours).', 'BlitzRefute runs in a recent browser or installed on the home screen. Your training data stays on your device: remember to back it up (⚙ Settings → My data). Evaluations come from the Stockfish engine; some features rely on third-party services (Lichess, Chess.com) whose availability does not depend on us. BlitzRefute is a training tool, to be used only where assistance is allowed (never during a game in progress).')}</p>
  <h3>7. ${L('Réclamations et médiation', 'Complaints and mediation')}</h3>
  <p>${L('Pour toute question ou réclamation', 'For any question or complaint')} : <a href="mailto:${esc(e.email)}">${esc(e.email)}</a>. ${L('En cas de litige non résolu, vous pouvez recourir gratuitement au médiateur de la consommation', 'If a dispute is not resolved, you may refer it free of charge to the consumer mediator')} : ${v(e.mediateur)}. ${L('Plateforme européenne de règlement des litiges : ec.europa.eu/consumers/odr.', 'EU online dispute resolution platform: ec.europa.eu/consumers/odr.')}</p>
  <h3>8. ${L('Droit applicable', 'Governing law')}</h3>
  <p>${L('Droit français. Ces conditions ne privent pas le consommateur des protections impératives de son pays de résidence.', 'French law. These terms do not deprive consumers of the mandatory protections of their country of residence.')}</p>`;
}

function confidentialite() {
  const e = LEGAL;
  return `<h2>${L('Politique de confidentialité', 'Privacy policy')}</h2>
  <p>${L('En bref : <strong>pas de compte, pas de cookies publicitaires, pas de revente de données.</strong> Votre progression reste sur votre appareil.', 'In short: <strong>no account, no advertising cookies, no selling of data.</strong> Your progress stays on your device.')}</p>
  <h3>${L('Données enregistrées sur votre appareil', 'Data stored on your device')}</h3>
  <p>${L('Ouvertures choisies, progression, réglages, analyses et parties importées sont enregistrés dans le stockage local de votre navigateur. Ils ne nous sont pas transmis. Vous pouvez les exporter, les importer ou les effacer (effacer les données du site dans le navigateur).', 'Chosen openings, progress, settings, analyses and imported games are stored in your browser’s local storage. They are not sent to us. You can export, import or erase them (clear the site’s data in your browser).')}</p>
  <h3>${L('Mesure d’audience', 'Audience measurement')}</h3>
  <p>${L('Nous comptons les visites de façon anonyme, sans cookies : Cloudflare Web Analytics, et un compteur de pages vues sur notre serveur (nom de la page seulement ; l’adresse IP sert uniquement à limiter les abus et est effacée chaque heure). Rien n’est compté si votre navigateur demande « ne pas suivre ».', 'We count visits anonymously, without cookies: Cloudflare Web Analytics, and a page-view counter on our server (page name only; the IP address is used only to limit abuse and is erased every hour). Nothing is counted if your browser sends “do not track”.')}</p>
  <h3>${L('Synchronisation entre appareils (facultative)', 'Sync between devices (optional)')}</h3>
  <p>${L('Si vous l’activez, vos données sont chiffrées sur votre appareil avec votre code secret avant d’être envoyées sur notre serveur (Cloudflare) : nous ne pouvons pas les lire. Vous pouvez les supprimer à tout moment en désactivant la synchronisation.', 'If you turn it on, your data is encrypted on your device with your secret code before being sent to our server (Cloudflare): we cannot read it. You can delete it at any time by turning sync off.')}</p>
  <h3>${L('Services tiers', 'Third-party services')}</h3>
  <p>${L('Certaines fonctions interrogent directement depuis votre appareil : Lichess (problèmes, statistiques, évaluations, import de vos parties, connexion officielle dont le jeton reste sur votre appareil), Chess.com (import de vos parties publiques), YouTube (vidéos). Ces services appliquent leur propre politique de confidentialité. Achat : vos données de paiement et de facturation sont traitées par Lemon Squeezy ; nous recevons seulement l’e-mail et le nom indiqués lors de l’achat, pour délivrer la licence et répondre à vos demandes.', 'Some features query these services directly from your device: Lichess (puzzles, statistics, evaluations, importing your games, official sign-in whose token stays on your device), Chess.com (importing your public games), YouTube (videos). These services apply their own privacy policy. Purchase: your payment and billing data is processed by Lemon Squeezy; we only receive the e-mail and name given at purchase, to deliver the licence and answer your requests.')}</p>
  <h3>${L('Vos droits', 'Your rights')}</h3>
  <p>${L(`Conformément au RGPD, vous pouvez demander l’accès, la rectification ou la suppression des données vous concernant que nous détenons (achat, messages) : <a href="mailto:${esc(e.email)}">${esc(e.email)}</a>. Vous pouvez aussi saisir la CNIL (cnil.fr). Responsable du traitement : `, `Under the GDPR, you may request access to, correction or deletion of the data we hold about you (purchase, messages): <a href="mailto:${esc(e.email)}">${esc(e.email)}</a>. You may also contact the French data protection authority (cnil.fr). Data controller: `)}${v(e.editeur)}.</p>`;
}

export class LegalPage {
  constructor({ el }) { this.el = el; }

  show() {
    const sec = location.hash.split('/')[2];
    const cur = SECTIONS.includes(sec) ? sec : 'mentions';
    const brouillon = !LEGAL.siret;
    const tab = (id, t) => `<a class="chip" href="#/legal/${id}" aria-pressed="${cur === id}">${t}</a>`;
    this.el.innerHTML = `<div class="legal pad">
      <h1>${L('Informations légales', 'Legal information')}</h1>
      <div class="chips">${tab('mentions', L('Mentions légales', 'Legal notice'))}${tab('cgv', L('Conditions de vente', 'Terms of sale'))}${tab('confidentialite', L('Confidentialité', 'Privacy'))}</div>
      ${brouillon ? `<p class="legal-brouillon small">${L('Version provisoire : ces textes seront complétés et s’appliqueront à l’ouverture de la vente.', 'Provisional version: these texts will be completed and will apply when sales open.')}</p>` : ''}
      <article class="card legal-texte">${{ mentions, cgv, confidentialite }[cur]()}
        <p class="muted small">${L('Mise à jour', 'Updated')} : ${esc(LEGAL.majLe)}</p></article>
    </div>`;
    window.scrollTo(0, 0);
  }
}

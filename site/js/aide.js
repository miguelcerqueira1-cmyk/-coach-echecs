// Aide : questions fréquentes, contact et « Signaler un problème ». Aucun serveur : le message est
// préparé dans l'application, puis envoyé par la messagerie de l'utilisateur (adresse de support
// publiée dans config.json → supportEmail) ou copié. Le diagnostic joint ne contient aucune donnée
// personnelle : page, version, navigateur, taille d'écran, état du moteur.

import { langue } from './i18n.js';
const L = (fr, en) => (langue() === 'en' ? en : fr);

export const FAQ = [
  [L('Comment installer l’appli sur mon téléphone ?', 'How do I install the app on my phone?'), L('iPhone : ouvre le site dans Safari, touche le bouton Partager puis « Sur l’écran d’accueil ». Android : dans Chrome, menu ⋮ puis « Installer l’application ». L’appli s’ouvre ensuite comme les autres, même hors connexion pour l’essentiel. Le guide illustré est dans ⚙ Réglages → « 📲 Comment installer l’appli ».', 'iPhone: open the site in Safari, tap the Share button, then “Add to Home Screen”. Android: in Chrome, menu ⋮ then “Install app”. The app then opens like any other, mostly even offline. The illustrated guide is in ⚙ Settings → “📲 How to install the app”.')],
  [L('Où sont enregistrées mes données ?', 'Where is my data stored?'), L('Uniquement sur ton appareil : progression, routine, réglages. Rien n’est envoyé sur un serveur (sauf si tu actives la synchronisation, chiffrée : le serveur ne peut pas la lire). Seul un compteur de visites anonyme, sans cookies (Cloudflare Web Analytics et le serveur de l’appli), compte les pages vues : il ne sait pas qui tu es et ne voit aucune de tes données. Pense à faire une sauvegarde de temps en temps (⚙ Réglages → Mes données → Exporter) : sur iPhone, Safari peut effacer les données d’un site non installé après quelques semaines sans visite. Pour passer sur un autre appareil : ⚙ Réglages → Mes données → Exporter, puis Importer sur le nouvel appareil.', 'Only on your device: progress, routine, settings. Nothing is sent to a server (unless you turn on sync, which is encrypted: the server cannot read it). Only an anonymous, cookie-free visit counter (Cloudflare Web Analytics and the app’s server) counts page views: it does not know who you are and sees none of your data. Remember to make a backup now and then (⚙ Settings → My data → Export): on iPhone, Safari may erase the data of a site that is not installed after a few weeks without a visit. To move to another device: ⚙ Settings → My data → Export, then Import on the new device.')],
  [L('Comment charger mes parties ?', 'How do I load my games?'), L('Page « Mes parties » : touche « Se connecter avec Lichess » (connexion officielle, ton mot de passe n’est jamais vu par l’appli) et/ou indique ton pseudo Chess.com, puis « Charger mes parties ».', '“My games” page: tap “Log in with Lichess” (official login, the app never sees your password) and/or enter your Chess.com username, then “Load my games”.')],
  [L('D’où viennent les coups conseillés et les évaluations ?', 'Where do the suggested moves and evaluations come from?'), L('Du moteur Stockfish, qui calcule sur ton appareil. Les lignes des fiches sont vérifiées par Stockfish ; les problèmes viennent de la base publique de Lichess. Rien n’est inventé.', 'From the Stockfish engine, which calculates on your device. The lines are checked by Stockfish; the puzzles come from the public Lichess database. Nothing is made up.')],
  [L('Comment changer ma routine du jour ?', 'How do I change my daily routine?'), L('Entraînement → Ma routine du jour → « ⚙ Modifier » : temps par jour, sites et cadences.', 'Training → My daily routine → “⚙ Edit”: time per day, sites and time controls.')],
  [L('Qu’apporte la version Pro ?', 'What does the Pro version add?'), L('Toutes les variantes de tes ouvertures, toutes les leçons, l’entraînement en répétition espacée, les réflexes anti-trash et les positions tirées de tes parties. La version gratuite garde le moteur, Mes parties, la routine et une variante par ouverture.', 'All the lines of your openings, all the lessons, spaced-repetition training, anti-trash reflexes and positions taken from your games. The free version keeps the engine, My games, the routine and one line per opening.')],
  [L('Est-ce un abonnement ?', 'Is it a subscription?'), L('Non. BlitzRefute Pro se paie une seule fois et reste à toi à vie, mises à jour et nouvelles variantes comprises. Aucun prélèvement automatique.', 'No. BlitzRefute Pro is paid once and stays yours for life, updates and new lines included. No automatic charges.')],
  [L('Puis-je être remboursé ?', 'Can I get a refund?'), L('Oui : si Pro ne te convient pas, écris-nous dans les 14 jours suivant l’achat et nous te remboursons, sans justification. Détails dans les conditions de vente (lien en bas de page).', 'Yes: if Pro doesn’t suit you, write to us within 14 days of purchase and we refund you, no questions asked. Details in the terms of sale (link at the bottom of the page).')],
  [L('Je change de téléphone : est-ce que je perds Pro et ma progression ?', 'I’m changing phones: do I lose Pro and my progress?'), L('Non. Pro : saisis ta clé de licence sur le nouvel appareil (fenêtre Pro → « J’ai un code d’accès »). Progression : ⚙ Réglages → Mes données → Exporter sur l’ancien appareil, puis Importer sur le nouveau (ou active la synchronisation chiffrée).', 'No. Pro: enter your licence key on the new device (Pro window → “I have an access code”). Progress: ⚙ Settings → My data → Export on the old device, then Import on the new one (or turn on encrypted sync).')],
  [L('Le paiement est-il sécurisé ?', 'Is payment secure?'), L('Oui. Le paiement est traité par Lemon Squeezy, revendeur spécialisé qui émet la facture et gère la TVA. BlitzRefute ne voit jamais tes coordonnées bancaires.', 'Yes. Payment is handled by Lemon Squeezy, a specialist reseller that issues the invoice and handles VAT. BlitzRefute never sees your bank details.')],
  [L('BlitzRefute fait-il partie de Lichess ou de Chess.com ?', 'Is BlitzRefute part of Lichess or Chess.com?'), L('Non. BlitzRefute est une application indépendante. Elle utilise les services publics de Lichess (problèmes, statistiques, évaluations, import de tes parties) et de Chess.com (import de tes parties), toujours cités comme sources, mais n’est ni affiliée ni approuvée par eux.', 'No. BlitzRefute is an independent app. It uses the public services of Lichess (puzzles, statistics, evaluations, importing your games) and Chess.com (importing your games), always credited as sources, but it is neither affiliated with nor endorsed by them.')],
  [L('L’appli marche-t-elle sans Internet ?', 'Does the app work without Internet?'), L('Oui après une première visite : échiquier, moteur, fiches et leçons. Il faut Internet pour les problèmes Lichess, charger ses parties et les statistiques en ligne.', 'Yes, after a first visit: board, engine, lines and lessons. Internet is needed for Lichess puzzles, loading your games and online statistics.')],
  [L('Le moteur affiche « en panne » ou ne répond plus', 'The engine shows “down” or stops responding'), L('Recharge la page (ou ferme et rouvre l’appli). Sur un téléphone très chargé, fermer d’autres applis libère de la mémoire pour Stockfish.', 'Reload the page (or close and reopen the app). On a busy phone, closing other apps frees memory for Stockfish.')],
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function diagnostic({ build = '', page = '', ua = '', ecran = '', moteur = '' } = {}) {
  return `---\nPage : ${page || '?'}\nVersion : ${build || '?'}\nNavigateur : ${ua || '?'}\nÉcran : ${ecran || '?'}\nMoteur : ${moteur || '?'}`;
}

// Lien « mailto: » vers le support (null si aucune adresse valide n'est publiée).
export function lienMail(email, sujet, corps) {
  if (!/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(email || '')) return null;
  return `mailto:${email}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}

export function ouvrirAide({ supportEmail = '', infos = () => ({}) } = {}) {
  const dlg = document.getElementById('dlg-aide');
  if (!dlg) return;
  const contact = /@/.test(supportEmail)
    ? `<p>${L('Une question ? Écris-nous :', 'A question? Write to us:')} <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a></p>`
    : `<p class="muted small">${L('L’adresse de contact sera publiée ici très bientôt. En attendant, le formulaire ci-dessous prépare ton message à copier.', 'The contact address will be published here very soon. Meanwhile, the form below prepares your message to copy.')}</p>`;
  dlg.querySelector('[data-aide-corps]').innerHTML = `
    <h3>${L('Questions fréquentes', 'Frequently asked questions')}</h3>
    ${FAQ.map(([q, r]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}
    <h3>${L('Contact', 'Contact')}</h3>${contact}
    <h3>🐞 ${L('Signaler un problème', 'Report a problem')}</h3>
    <label>${L('Qu’est-ce qui ne va pas ?', 'What’s wrong?')} <textarea data-bug rows="4" placeholder="${L('Ex. : sur la page Entraînement, le bouton … ne fait rien quand…', 'E.g.: on the Training page, the … button does nothing when…')}"></textarea></label>
    <p class="muted tiny">${L('Un petit diagnostic est joint (page, version, navigateur, écran) : aucune donnée personnelle, ni tes parties ni ta progression.', 'A short diagnostic is attached (page, version, browser, screen): no personal data, neither your games nor your progress.')}</p>
    <div class="dlg-actions left"><button type="button" class="primary" data-bug-envoyer>${/@/.test(supportEmail) ? L('Envoyer par e-mail', 'Send by e-mail') : L('Copier le message', 'Copy the message')}</button></div>
    <p class="small" data-bug-msg role="status"></p>`;
  dlg.querySelector('[data-bug-envoyer]').addEventListener('click', async () => {
    const txt = dlg.querySelector('[data-bug]').value.trim();
    const msg = dlg.querySelector('[data-bug-msg]');
    if (!txt) { msg.textContent = L('Décris le problème en quelques mots.', 'Describe the problem in a few words.'); msg.className = 'small error-text'; return; }
    const corps = `${txt}\n\n${diagnostic(infos())}`;
    const mail = lienMail(supportEmail, L('BlitzRefute : problème signalé', 'BlitzRefute: problem report'), corps);
    if (mail) { location.href = mail; msg.textContent = L('Ta messagerie s’ouvre avec le message prêt : il ne reste qu’à l’envoyer.', 'Your mail app opens with the message ready: just send it.'); msg.className = 'small ok-text'; return; }
    try {
      await navigator.clipboard.writeText(corps);
      msg.textContent = L('✔ Message copié : colle-le où tu veux nous l’envoyer.', '✔ Message copied: paste it wherever you want to send it to us.');
      msg.className = 'small ok-text';
    } catch {
      msg.textContent = L('Copie impossible : sélectionne le texte à la main.', 'Copy failed: select the text by hand.');
      msg.className = 'small error-text';
    }
  });
  if (!dlg.open) dlg.showModal();
}

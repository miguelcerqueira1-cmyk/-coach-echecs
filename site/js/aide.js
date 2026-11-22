// Aide : questions fréquentes, contact et « Signaler un problème ». Aucun serveur : le message est
// préparé dans l'application, puis envoyé par la messagerie de l'utilisateur (adresse de support
// publiée dans config.json → supportEmail) ou copié. Le diagnostic joint ne contient aucune donnée
// personnelle : page, version, navigateur, taille d'écran, état du moteur.

export const FAQ = [
  ['Comment installer l’appli sur mon téléphone ?', 'iPhone : ouvre le site dans Safari, touche le bouton Partager puis « Sur l’écran d’accueil ». Android : dans Chrome, menu ⋮ puis « Installer l’application ». L’appli s’ouvre ensuite comme les autres, même hors connexion pour l’essentiel.'],
  ['Où sont enregistrées mes données ?', 'Uniquement sur ton appareil : progression, routine, réglages. Rien n’est envoyé sur un serveur. Pour passer sur un autre appareil : ⚙ Réglages → Mes données → Exporter, puis Importer sur le nouvel appareil.'],
  ['Comment charger mes parties ?', 'Page « Mes parties » : touche « Se connecter avec Lichess » (connexion officielle, ton mot de passe n’est jamais vu par l’appli) et/ou indique ton pseudo Chess.com, puis « Charger mes parties ».'],
  ['D’où viennent les coups conseillés et les évaluations ?', 'Du moteur Stockfish, qui calcule sur ton appareil. Les lignes des fiches sont vérifiées par Stockfish ; les problèmes viennent de la base publique de Lichess. Rien n’est inventé.'],
  ['Comment changer ma routine du jour ?', 'Entraînement → Ma routine du jour → « ⚙ Modifier » : temps par jour, sites et cadences.'],
  ['Qu’apporte la version Pro ?', 'Toutes les variantes de tes ouvertures, toutes les leçons, l’entraînement en répétition espacée, les réflexes anti-trash et les positions tirées de tes parties. La version gratuite garde le moteur, Mes parties, la routine et une variante par ouverture.'],
  ['L’appli marche-t-elle sans Internet ?', 'Oui après une première visite : échiquier, moteur, fiches et leçons. Il faut Internet pour les problèmes Lichess, charger ses parties et les statistiques en ligne.'],
  ['Le moteur affiche « en panne » ou ne répond plus', 'Recharge la page (ou ferme et rouvre l’appli). Sur un téléphone très chargé, fermer d’autres applis libère de la mémoire pour Stockfish.'],
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
    ? `<p>Une question ? Écris-nous : <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a></p>`
    : '<p class="muted small">L’adresse de contact sera publiée ici très bientôt. En attendant, le formulaire ci-dessous prépare ton message à copier.</p>';
  dlg.querySelector('[data-aide-corps]').innerHTML = `
    <h3>Questions fréquentes</h3>
    ${FAQ.map(([q, r]) => `<details class="faq"><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('')}
    <h3>Contact</h3>${contact}
    <h3>🐞 Signaler un problème</h3>
    <label>Qu’est-ce qui ne va pas ? <textarea data-bug rows="4" placeholder="Ex. : sur la page Entraînement, le bouton … ne fait rien quand…"></textarea></label>
    <p class="muted tiny">Un petit diagnostic est joint (page, version, navigateur, écran) : aucune donnée personnelle, ni tes parties ni ta progression.</p>
    <div class="dlg-actions left"><button type="button" class="primary" data-bug-envoyer>${/@/.test(supportEmail) ? 'Envoyer par e-mail' : 'Copier le message'}</button></div>
    <p class="small" data-bug-msg role="status"></p>`;
  dlg.querySelector('[data-bug-envoyer]').addEventListener('click', async () => {
    const txt = dlg.querySelector('[data-bug]').value.trim();
    const msg = dlg.querySelector('[data-bug-msg]');
    if (!txt) { msg.textContent = 'Décris le problème en quelques mots.'; msg.className = 'small error-text'; return; }
    const corps = `${txt}\n\n${diagnostic(infos())}`;
    const mail = lienMail(supportEmail, 'BlitzRefute : problème signalé', corps);
    if (mail) { location.href = mail; msg.textContent = 'Ta messagerie s’ouvre avec le message prêt : il ne reste qu’à l’envoyer.'; msg.className = 'small ok-text'; return; }
    try {
      await navigator.clipboard.writeText(corps);
      msg.textContent = '✔ Message copié : colle-le où tu veux nous l’envoyer.';
      msg.className = 'small ok-text';
    } catch {
      msg.textContent = 'Copie impossible : sélectionne le texte à la main.';
      msg.className = 'small error-text';
    }
  });
  if (!dlg.open) dlg.showModal();
}

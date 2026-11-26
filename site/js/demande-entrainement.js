// Passerelle « 1 clic » vers l'Entraînement : une page (Répertoire, Mes parties) dépose une
// demande puis change de page ; TrainingPage.show() la prend et la lance.
//   { type: 'fiche', id }        leçon si pas encore suivie, sinon révision de la variante
//   { type: 'reelle', gameId }   position ratée d'une de mes parties
//   { type: 'continuer' }        la chose la plus utile du moment
let demande = null;

export function demanderEntrainement(req) {
  demande = req;
  if (location.hash.startsWith('#/entrainement')) window.dispatchEvent(new CustomEvent('demande-entrainement'));
  else location.hash = '#/entrainement';
}

export function prendreDemande() {
  const d = demande;
  demande = null;
  return d;
}

// Navigation entre les deux pages par l'ancre de l'URL (#/moteur, #/repertoire) :
// pas de rechargement, l'état de la partie et du moteur est conservé.
const PAGES = ['moteur', 'repertoire'];

export function currentPage() {
  const p = location.hash.replace(/^#\/?/, '').split('/')[0];
  return PAGES.includes(p) ? p : 'moteur';
}

export function initRouter({ onShow }) {
  const show = () => {
    const page = currentPage();
    for (const p of PAGES) {
      document.getElementById(`page-${p}`).classList.toggle('hidden', p !== page);
      document.querySelector(`.tabs [data-page="${p}"]`)?.setAttribute('aria-current', p === page ? 'page' : 'false');
    }
    onShow(page);
  };
  window.addEventListener('hashchange', show);
  show();
}

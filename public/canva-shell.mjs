import { activePage } from './store.mjs';

const $ = id => document.getElementById(id);

const PORTAL_URL = 'https://touche-citas-usuarios.fabrizziopelaez91.workers.dev';
const ZOOM_KEY = 'touche_canvas_zoom_v1';
const RAIL_KEY = 'touche_canvas_rail_expanded_v1';

let currentZoom = 100;

function showToast(msg) {
  const toast = $('toast');
  const txt = $('toast-text');
  if (!toast || !txt) return;
  txt.textContent = msg;
  toast.hidden = false;
  clearTimeout(window.__canvaToastTimer);
  window.__canvaToastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}

/* 1. Bottom-right Canva Zoom & Focus Dock (collapsible so it never occludes content) */
function syncContentZoom() {
  const content = document.querySelector('.content');
  if (!content) return;
  const isMobile = window.innerWidth <= 700;
  content.style.zoom = (isMobile || currentZoom === 100) ? '' : (currentZoom / 100);
}

function applyZoom(pct) {
  currentZoom = Math.max(90, Math.min(125, Math.round(Number(pct) / 5) * 5 || 100));
  syncContentZoom();
  const range = $('canvas-zoom-range');
  const label = $('canvas-zoom-label');
  const pillLabel = $('canvas-zoom-pill-label');
  if (range) range.value = String(currentZoom);
  if (label) label.textContent = `${currentZoom}%`;
  if (pillLabel) pillLabel.textContent = `${currentZoom}%`;
  try { localStorage.setItem(ZOOM_KEY, String(currentZoom)); } catch {}
}

function initZoomDock() {
  let saved = 100;
  try { saved = Number(localStorage.getItem(ZOOM_KEY)) || 100; } catch {}
  applyZoom(saved);

  const dock = $('canvas-zoom-dock');
  const toggleBtn = $('canvas-zoom-toggle');
  const controls = $('canvas-zoom-controls');
  const closeBtn = $('canvas-zoom-close');

  function setDockExpanded(expanded) {
    if (!dock || !controls || !toggleBtn) return;
    dock.classList.toggle('is-collapsed', !expanded);
    controls.hidden = !expanded;
    toggleBtn.hidden = expanded;
    toggleBtn.setAttribute('aria-expanded', String(expanded));
  }

  setDockExpanded(false);
  toggleBtn?.addEventListener('click', () => setDockExpanded(true));
  closeBtn?.addEventListener('click', () => setDockExpanded(false));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && controls && !controls.hidden) setDockExpanded(false);
  });

  window.addEventListener('resize', syncContentZoom);

  $('canvas-zoom-range')?.addEventListener('input', e => applyZoom(e.target.value));
  $('canvas-zoom-out')?.addEventListener('click', () => applyZoom(currentZoom - 5));
  $('canvas-zoom-in')?.addEventListener('click', () => applyZoom(currentZoom + 5));
  $('canvas-zoom-label')?.addEventListener('click', () => {
    applyZoom(100);
    showToast('Tamaño de vista restablecido al 100%.');
  });

  const focusBtn = $('canvas-focus-btn');
  focusBtn?.addEventListener('click', () => {
    const active = document.documentElement.classList.toggle('canvas-focus-mode');
    focusBtn.setAttribute('aria-pressed', String(active));
    focusBtn.title = active ? 'Mostrar barra lateral de iconos' : 'Modo lienzo amplio (ocultar barra lateral)';
    showToast(active ? 'Modo lienzo amplio activado.' : 'Barra lateral visible de nuevo.');
  });
}

/* 2. Canva Left Rail Expand/Collapse + Bottom-Left Sparkle Quick Popover */
function initRailAndPopover() {
  const pop = $('canva-quick-popover');
  const fab = $('canva-menu-fab');
  const topAvatar = $('top-avatar');
  const railToggle = $('canva-rail-toggle');

  function setExpandedRail(expanded) {
    document.body.classList.toggle('rail-expanded', expanded);
    if (railToggle) {
      railToggle.textContent = expanded ? '◀ Modo barra compacta Canva' : '▶ Ampliar textos del menú';
      railToggle.setAttribute('aria-pressed', String(expanded));
    }
    try { localStorage.setItem(RAIL_KEY, expanded ? '1' : '0'); } catch {}
  }

  let savedExpanded = false;
  try { savedExpanded = localStorage.getItem(RAIL_KEY) === '1'; } catch {}
  setExpandedRail(savedExpanded);

  railToggle?.addEventListener('click', () => {
    setExpandedRail(!document.body.classList.contains('rail-expanded'));
  });

  function setPopover(open) {
    if (!pop) return;
    pop.hidden = !open;
    fab?.setAttribute('aria-expanded', String(open));
    topAvatar?.setAttribute('aria-expanded', String(open));
  }

  fab?.addEventListener('click', e => {
    e.stopPropagation();
    setPopover(pop?.hidden ?? true);
  });
  topAvatar?.addEventListener('click', e => {
    e.stopPropagation();
    setPopover(pop?.hidden ?? true);
  });
  $('canva-popover-close')?.addEventListener('click', () => setPopover(false));
  $('popover-share-portal')?.addEventListener('click', () => {
    setPopover(false);
    $('sidebar')?.classList.remove('open');
    $('menu-toggle')?.setAttribute('aria-expanded', 'false');
    openSharePortalModal();
  });

  document.addEventListener('pointerdown', e => {
    if (!pop || pop.hidden) return;
    if (e.target.closest('#canva-quick-popover') || e.target.closest('#canva-menu-fab') || e.target.closest('#top-avatar')) return;
    setPopover(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop && !pop.hidden) setPopover(false);
  });
}

function openSharePortalModal() {
  const shareModal = $('share-portal-modal');
  const feedback = $('share-portal-feedback');
  if (feedback) { feedback.textContent = ''; feedback.hidden = true; }
  if (shareModal) shareModal.showModal();
}

/* 3. Canva Topbar Quick-Add (+) & White Share Portal Button */
function initTopbarActions() {
  $('topbar-quick-add')?.addEventListener('click', () => {
    const page = activePage();
    if (page === 'clients') {
      $('new-client')?.click();
    } else if (page === 'team') {
      $('team-add-btn')?.click();
    } else if (page === 'accounts') {
      $('new-account-btn')?.click();
    } else {
      if (page !== 'agenda') location.hash = '#agenda';
      window.dispatchEvent(new Event('touche:open-new-appointment'));
    }
  });

  const shareModal = $('share-portal-modal');
  $('topbar-share-portal')?.addEventListener('click', openSharePortalModal);
  for (const id of ['share-portal-close', 'share-portal-done']) {
    $(id)?.addEventListener('click', () => shareModal?.close());
  }
  $('share-portal-copy')?.addEventListener('click', async () => {
    const feedback = $('share-portal-feedback');
    try {
      await navigator.clipboard.writeText(PORTAL_URL);
      if (feedback) {
        feedback.textContent = '✓ ¡Enlace copiado! Ya puedes pegarlo en WhatsApp.';
        feedback.hidden = false;
      }
      showToast('¡Enlace de citas copiado! Ya puedes pegarlo en WhatsApp.');
    } catch {
      const inp = $('share-portal-url');
      if (inp) { inp.select(); document.execCommand('copy'); }
      if (feedback) {
        feedback.textContent = '✓ Enlace seleccionado y listo para compartir.';
        feedback.hidden = false;
      }
      showToast('Enlace listo para compartir con tus clientas.');
    }
  });
}

initZoomDock();
initRailAndPopover();
initTopbarActions();

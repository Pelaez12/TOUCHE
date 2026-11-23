const $ = id => document.getElementById(id);

const PORTAL_URL = 'https://touche-citas-usuarios.fabrizziopelaez91.workers.dev';
const ZOOM_KEY = 'touche_canvas_zoom_v1';
const RAIL_KEY = 'touche_canvas_rail_expanded_v1';

function showToast(msg) {
  const toast = $('toast');
  const txt = $('toast-text');
  if (!toast || !txt) return;
  txt.textContent = msg;
  toast.hidden = false;
  clearTimeout(window.__canvaToastTimer);
  window.__canvaToastTimer = setTimeout(() => { toast.hidden = true; }, 3800);
}

/* 1. Bottom-right Canva Zoom & Focus Dock */
function applyZoom(pct) {
  const clamped = Math.max(90, Math.min(125, Math.round(Number(pct) / 5) * 5 || 100));
  const content = document.querySelector('.content');
  if (content) {
    content.style.zoom = clamped === 100 ? '' : (clamped / 100);
  }
  const range = $('canvas-zoom-range');
  const label = $('canvas-zoom-label');
  if (range) range.value = String(clamped);
  if (label) label.textContent = `${clamped}%`;
  try { localStorage.setItem(ZOOM_KEY, String(clamped)); } catch {}
}

function initZoomDock() {
  let saved = 100;
  try { saved = Number(localStorage.getItem(ZOOM_KEY)) || 100; } catch {}
  applyZoom(saved);

  $('canvas-zoom-range')?.addEventListener('input', e => applyZoom(e.target.value));
  $('canvas-zoom-out')?.addEventListener('click', () => {
    const cur = Number($('canvas-zoom-range')?.value || 100);
    applyZoom(cur - 5);
  });
  $('canvas-zoom-in')?.addEventListener('click', () => {
    const cur = Number($('canvas-zoom-range')?.value || 100);
    applyZoom(cur + 5);
  });
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

  document.addEventListener('pointerdown', e => {
    if (!pop || pop.hidden) return;
    if (e.target.closest('#canva-quick-popover') || e.target.closest('#canva-menu-fab') || e.target.closest('#top-avatar')) return;
    setPopover(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && pop && !pop.hidden) setPopover(false);
  });
}

/* 3. Canva Topbar Quick-Add (+) & White Share Portal Button */
function initTopbarActions() {
  $('topbar-quick-add')?.addEventListener('click', () => {
    const hash = location.hash || '#agenda';
    if (hash === '#clientas') {
      $('new-client')?.click();
    } else if (hash === '#equipo') {
      $('team-add-btn')?.click();
    } else if (hash === '#cuentas') {
      $('new-account-btn')?.click();
    } else {
      if (hash !== '#agenda') location.hash = '#agenda';
      setTimeout(() => {
        const btn = $('agenda-new');
        if (btn && !btn.disabled) btn.click();
      }, hash === '#agenda' ? 0 : 140);
    }
  });

  const shareModal = $('share-portal-modal');
  $('topbar-share-portal')?.addEventListener('click', () => {
    if (shareModal) shareModal.showModal();
  });
  for (const id of ['share-portal-close', 'share-portal-done']) {
    $(id)?.addEventListener('click', () => shareModal?.close());
  }
  $('share-portal-copy')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(PORTAL_URL);
      showToast('¡Enlace de citas copiado! Ya puedes pegarlo en WhatsApp.');
    } catch {
      const inp = $('share-portal-url');
      if (inp) { inp.select(); document.execCommand('copy'); }
      showToast('Enlace listo para compartir con tus clientas.');
    }
  });
}

initZoomDock();
initRailAndPopover();
initTopbarActions();

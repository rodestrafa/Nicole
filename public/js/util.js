// Utilidades compartidas de Nicole: API, avisos, formatos, etiquetas de los catálogos e iconos.
import { html, useState, useEffect, useCallback } from '/vendor/preact-htm.js';

export async function api(path, opts = {}) {
  const r = await fetch(`/api/${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

let toastTimer;
export function toast(msg, bad = false) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
  el.className = `toast${bad ? ' bad' : ''}`; el.textContent = msg;
  el.setAttribute('role', bad ? 'alert' : 'status');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), bad ? 6000 : 3000);
}

export function useAsync(fn, deps) {
  const [st, set] = useState({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    set((s) => ({ ...s, loading: true }));
    return fn().then((data) => set({ data, error: null, loading: false })).catch((error) => set({ data: null, error, loading: false }));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...st, reload };
}

export const ir = (h) => { location.hash = h; };
export const fecha = (s) => (s ? new Date(s.length > 10 ? s.replace(' ', 'T') + 'Z' : `${s}T00:00:00`).toLocaleDateString('en-GB') : '');
export const fechaHora = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const hoyISO = () => new Date().toISOString().slice(0, 10);
export const leeBase64 = (file) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => ko(r.error); r.readAsDataURL(file); });

// Importes: por debajo de medio millón en K€ (400K€); a partir de ahí en millones con MM (3,7MM€)
export function eur(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 500000) return `${(v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 2 })}MM€`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000).toLocaleString('es-ES')}K€`;
  return `${Math.round(v).toLocaleString('es-ES')}€`;
}
export const dias = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 1 })} d`);

// ---------- Etiquetas ----------
export const ESTADOS = [['new', 'New'], ['assigned', 'Assigned · to estimate'], ['planned', 'Planned'], ['progress', 'In progress'], ['done', 'Done']];
export const estadoNombre = (e) => (ESTADOS.find((x) => x[0] === e) || [e, e])[1];
export const TIPOS = [['poc', 'PoC'], ['implementacion', 'Implementation'], ['investigacion', 'Research'], ['demo', 'Demo'], ['ensenar_agencia', 'Agency showcase'],
  ['mejora', 'Improvement'], ['soporte', 'Team support'], ['formacion', 'Training'], ['asesoria', 'Adoption advisory'], ['charla', 'Talk'], ['boletin', 'Newsletter']];
export const tipoNombre = (t) => (TIPOS.find((x) => x[0] === t) || [t, t || '—'])[1];
export const ROLES = [['admin', 'Admin'], ['principal_director', 'Principal Director'], ['director', 'Director'], ['architect', 'Architect'], ['pm', 'PM'], ['builder', 'Builder']];
export const rolNombre = (r) => (ROLES.find((x) => x[0] === r) || [r, r || '—'])[1];
export const MADUREZ = [['concepto', 'Concept'], ['construccion', 'In construction'], ['beta', 'Beta'], ['productiva', 'Productive']];
export const madurezNombre = (m) => (MADUREZ.find((x) => x[0] === m) || [m, m || '—'])[1];
export const PRIO_EN = { 'Crítica': 'Critical', Alta: 'High', Media: 'Medium', Baja: 'Low' };
export const ORDEN_PRIO = { 'Crítica': 0, Alta: 1, Media: 2, Baja: 3 };

// Prioridad sugerida por cliente: misma lógica que functions/api/_maestros.js (prioridadSugerida)
export function sugierePrioridad(cliente, pais, reglas) {
  const p = pais || cliente?.pais || '';
  const has = (v, t) => !!t && String(v || '').toLowerCase().includes(String(t).toLowerCase());
  for (const r of reglas || []) {
    if (r.campo === 'fuera_espana' ? p && p !== 'España'
      : r.campo === 'pais' ? has(p, r.texto)
      : r.campo === 'cliente' ? has(cliente?.nombre, r.texto)
      : r.campo === 'family' ? has(cliente?.client_family, r.texto)
      : r.campo === 'sector' ? has(cliente?.sector, r.texto) : false) return r.prioridad;
  }
  return cliente || p ? 'Media' : null;
}

export function BadgePrio({ p }) {
  if (!p) return '';
  const c = { 'Crítica': 'bad', Alta: 'warn', Media: 'gris', Baja: 'gris' }[p];
  return html`<span class=${`badge ${c}`} title="Priority">${PRIO_EN[p] || p}</span>`;
}
export function BadgeTipo({ t }) {
  return html`<span class=${`badge tipo t-${t}`}>${tipoNombre(t)}</span>`;
}
export function BadgeMadurez({ m }) {
  const c = { productiva: 'ok', beta: 'warn', construccion: '', concepto: 'gris' }[m] ?? 'gris';
  return html`<span class=${`badge ${c}`}>${madurezNombre(m)}</span>`;
}

// ---------- Iconos (mismo trazo que Charlize) ----------
const svg = (d) => html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML=${{ __html: d }}></svg>`;
export const ICONOS = {
  inicio: svg('<path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>'),
  demandas: svg('<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'),
  kanban: svg('<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>'),
  gantt: svg('<path d="M3 4v16h18"/><rect x="6" y="6" width="8" height="3" rx="1"/><rect x="9" y="11" width="9" height="3" rx="1"/><rect x="7" y="16" width="6" height="2.5" rx="1"/>'),
  capacidad: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M17 4v10M14 11l3 3 3-3"/>'),
  maestros: svg('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  agencias: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>'),
  historial: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>'),
  usuarios: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.2c2.9-.4 5 1.8 5 4.8"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  ayuda: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><circle cx="12" cy="17" r=".6"/>'),
  sol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  luna: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  salir: svg('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
  plegar: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>'),
  compartir: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.9l7.6-4.6M8.2 13.1l7.6 4.6"/>'),
  clip: svg('<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>'),
  campana: svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>'),
  estrella: svg('<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
};

// Demandas: filtros, lista, Kanban, Gantt, capacidad, ficha y alta (también desde audio con IA).
import { html, useState, useEffect, useMemo, useRef } from '/vendor/preact-htm.js';
import {
  api, toast, useAsync, ir, fecha, eur, dias, hoyISO, leeBase64, ESTADOS, estadoNombre, TIPOS, tipoNombre, PRIO_EN, ORDEN_PRIO,
  BadgePrio, BadgeTipo, BadgeMadurez, ICONOS, rolNombre, sugierePrioridad,
} from './util.js';
import { useDictado, vozSoportada } from './voz.js';

// ---------- Filtros (compartidos por lista, Kanban y Gantt) y vistas favoritas ----------
const FILTROS_VACIOS = { q: '', estado: '', tipo: '', sector: '', family: '', cliente: '', manager: '', prioridad: '', tecnologia: '', agencia: '', persona: '', pais: '' };
const vistaDeHash = () => new URLSearchParams(location.hash.split('?')[1] || '').get('vista');
// Cada página recuerda sus filtros en la sesión; si se abre con ?vista=<id> o hay una vista por defecto, empieza con esa.
export function useFiltros(pagina, me) {
  const clave = `filtrosNicole_${pagina}`;
  const vistas = me?.preferencias?.vistas || [];
  const [f, setF] = useState(() => {
    const v = vistas.find((x) => x.id === vistaDeHash()) || (!sessionStorage[clave] && vistas.find((x) => x.pagina === pagina && x.defecto));
    if (v) return { ...FILTROS_VACIOS, ...v.filtros };
    try { return { ...FILTROS_VACIOS, ...JSON.parse(sessionStorage[clave] || '{}') }; } catch { return { ...FILTROS_VACIOS }; }
  });
  useEffect(() => { const v = vistas.find((x) => x.id === vistaDeHash()); if (v) setF({ ...FILTROS_VACIOS, ...v.filtros }); }, [location.hash]);
  useEffect(() => { try { sessionStorage[clave] = JSON.stringify(f); } catch {} }, [f]);
  return [f, setF];
}
async function guardaVistas(me, vistas) {
  await api('preferencias', { method: 'PUT', body: { clave: 'vistas', valor: vistas } });
  me.preferencias = { ...(me.preferencias || {}), vistas };
  window.dispatchEvent(new Event('nicole-vistas'));
}
function VistasGuardadas({ me, pagina, f, setF, extra, onExtra }) {
  const [, rerender] = useState(0);
  useEffect(() => { const h = () => rerender((n) => n + 1); window.addEventListener('nicole-vistas', h); return () => window.removeEventListener('nicole-vistas', h); }, []);
  const vistas = (me.preferencias?.vistas || []).filter((v) => v.pagina === pagina);
  const actual = vistas.find((v) => JSON.stringify({ ...FILTROS_VACIOS, ...v.filtros }) === JSON.stringify(f));
  async function guardar() {
    const nombre = prompt('Name for this view (e.g. Utilities, Banking, My requests)', actual?.nombre || '');
    if (!nombre?.trim()) return;
    const otras = (me.preferencias?.vistas || []).filter((v) => !(v.pagina === pagina && v.nombre === nombre.trim()));
    try { await guardaVistas(me, [...otras, { id: Math.random().toString(36).slice(2, 9), nombre: nombre.trim().slice(0, 40), pagina, filtros: f, extra: extra || null, defecto: false }]); toast(`View “${nombre.trim()}” saved`); } catch (x) { toast(x.message, true); }
  }
  async function defecto(v) {
    const todas = (me.preferencias?.vistas || []).map((x) => (x.pagina === pagina ? { ...x, defecto: x.id === v.id ? !x.defecto : false } : x));
    try { await guardaVistas(me, todas); toast(todas.find((x) => x.id === v.id).defecto ? `“${v.nombre}” opens by default` : 'No default view'); } catch (x) { toast(x.message, true); }
  }
  async function borrar(v) {
    if (!confirm(`Delete the view “${v.nombre}”?`)) return;
    try { await guardaVistas(me, (me.preferencias?.vistas || []).filter((x) => x.id !== v.id)); } catch (x) { toast(x.message, true); }
  }
  return html`<div class="vistas" role="group" aria-label="Saved views">
    <span class="small muted">${ICONOS.estrella} Views</span>
    ${vistas.map((v) => html`<span class=${`chip${actual?.id === v.id ? ' on' : ''}`}>
      <button type="button" class="link" onClick=${() => { setF({ ...FILTROS_VACIOS, ...v.filtros }); if (v.extra && onExtra) onExtra(v.extra); }}>${v.nombre}</button>
      <button type="button" class="x" title=${v.defecto ? 'Opens by default. Click to unset' : 'Open this view by default'} aria-label=${`Default view ${v.nombre}`} onClick=${() => defecto(v)}>${v.defecto ? '★' : '☆'}</button>
      <button type="button" class="x" aria-label=${`Delete view ${v.nombre}`} onClick=${() => borrar(v)}>×</button></span>`)}
    <button type="button" class="link" onClick=${guardar}>+ Save current filters as a view</button>
  </div>`;
}
const sinT = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function pasa(d, f) {
  if (f.estado && d.estado !== f.estado) return false;
  if (f.tipo && d.tipo !== f.tipo) return false;
  if (f.sector && d.sector !== f.sector) return false;
  if (f.family && d.client_family !== f.family) return false;
  if (f.cliente && String(d.cliente_id) !== f.cliente) return false;
  if (f.manager && String(d.manager_id) !== f.manager) return false;
  if (f.prioridad && d.prioridad !== f.prioridad) return false;
  if (f.agencia && !d.agencias.includes(f.agencia)) return false;
  if (f.persona && !d.personas.some((p) => String(p.persona_id) === f.persona)) return false;
  if (f.pais && (d.pais || 'España') !== f.pais) return false;
  if (f.tecnologia && !sinT(d.tecnologias).split(/\s*,\s*/).includes(sinT(f.tecnologia))) return false;
  if (f.q && !sinT(`${d.titulo} ${d.descripcion} ${d.cliente} ${d.proyecto} ${d.tecnologias} ${d.sponsor} ${d.id}`).includes(sinT(f.q))) return false;
  return true;
}
const unicos = (l) => [...new Set(l.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));

export function Filtros({ f, setF, cat, sinEstado, me, pagina, extra, onExtra }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'sector' ? { family: '', cliente: '' } : k === 'family' ? { cliente: '' } : {}) });
  const clientes = cat.clientes.filter((c) => (!f.sector || c.sector === f.sector) && (!f.family || c.client_family === f.family));
  const families = unicos(cat.clientes.filter((c) => !f.sector || c.sector === f.sector).map((c) => c.client_family));
  const activos = Object.entries(f).filter(([k, v]) => v && !(sinEstado && k === 'estado')).length;
  return html`<div class="filtros">
    <input aria-label="Search requests" placeholder="Search (title, client, technology…)" value=${f.q} onInput=${set('q')} />
    ${!sinEstado && html`<select aria-label="Status" value=${f.estado} onChange=${set('estado')}><option value="">Any status</option>${ESTADOS.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>`}
    <select aria-label="Type" value=${f.tipo} onChange=${set('tipo')}><option value="">Any type</option>${TIPOS.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
    <select aria-label="Country" value=${f.pais} onChange=${set('pais')}><option value="">All countries</option>${cat.paises.map((s) => html`<option value=${s}>${s}</option>`)}</select>
    <select aria-label="Sector" value=${f.sector} onChange=${set('sector')}><option value="">All sectors</option>${cat.sectores.map((s) => html`<option value=${s}>${s}</option>`)}</select>
    <select aria-label="Client family" value=${f.family} onChange=${set('family')}><option value="">All client families</option>${families.map((s) => html`<option value=${s}>${s}</option>`)}</select>
    <select aria-label="Client" value=${f.cliente} onChange=${set('cliente')}><option value="">All clients</option>${clientes.map((c) => html`<option value=${String(c.id)}>${c.nombre}</option>`)}</select>
    <select aria-label="Responsible manager" value=${f.manager} onChange=${set('manager')}><option value="">All managers</option>${cat.contactos.filter((c) => c.es_manager).map((c) => html`<option value=${String(c.id)}>${c.nombre}</option>`)}</select>
    <select aria-label="Priority" value=${f.prioridad} onChange=${set('prioridad')}><option value="">Any priority</option>${cat.prioridades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select>
    <select aria-label="Technology" value=${f.tecnologia} onChange=${set('tecnologia')}><option value="">Any technology</option>${cat.tecnologias.map((t) => html`<option value=${t}>${t}</option>`)}</select>
    <select aria-label="Agency" value=${f.agencia} onChange=${set('agencia')}><option value="">Any agency</option>${cat.agencias.map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}</select>
    <select aria-label="Person" value=${f.persona} onChange=${set('persona')}><option value="">Anyone</option>${cat.personas.filter((p) => p.activo).map((p) => html`<option value=${String(p.id)}>${p.nombre}</option>`)}</select>
    ${activos > 0 && html`<button class="ghost" onClick=${() => setF({ ...FILTROS_VACIOS, ...(sinEstado ? { estado: f.estado } : {}) })}>Clear filters (${activos})</button>`}
  </div>
  ${me && html`<${VistasGuardadas} me=${me} pagina=${pagina} f=${f} setF=${setF} extra=${extra} onExtra=${onExtra} />`}`;
}

const iniciales = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
function Equipo({ d }) {
  if (!d.personas.length) return html`<span class="muted small">—</span>`;
  return html`<span class="avatares">${d.personas.slice(0, 4).map((p) => html`<span class="avatar mini" title=${`${p.nombre}${p.funcion ? ` · ${p.funcion}` : ''}`}>${iniciales(p.nombre)}</span>`)}${d.personas.length > 4 ? html`<span class="small muted">+${d.personas.length - 4}</span>` : ''}</span>`;
}

function useDemandas(archivadas = false) {
  return useAsync(() => api(`demandas?archivadas=${archivadas ? 1 : 0}`), [archivadas]);
}

function Cabecera({ titulo, children, me, onNueva }) {
  return html`<div class="row" style="margin-bottom:12px"><h1 style="margin:0">${titulo}</h1><span class="spacer"></span>${children}
    <button class="primary" onClick=${onNueva}>+ New request</button></div>`;
}

// ---------- Lista ----------
export function Lista({ me, cat, recargaCat }) {
  const [arch, setArch] = useState(false);
  const { data, error, reload } = useDemandas(arch);
  const [f, setF] = useFiltros('demandas', me);
  const [orden, setOrden] = useState('actualizado');
  const [nueva, setNueva] = useState(false);
  if (error) return html`<div class="panel">Error: ${error.message}</div>`;
  const l = (data || []).filter((d) => pasa(d, f)).sort({
    actualizado: (a, b) => (b.actualizado || '').localeCompare(a.actualizado || ''),
    prioridad: (a, b) => (ORDEN_PRIO[a.prioridad] ?? 9) - (ORDEN_PRIO[b.prioridad] ?? 9) || (a.fecha_fin || '9').localeCompare(b.fecha_fin || '9'),
    fin: (a, b) => (a.fecha_fin || '9').localeCompare(b.fecha_fin || '9'),
    coste: (a, b) => (b.coste?.total || 0) - (a.coste?.total || 0),
  }[orden]);
  const costes = me.permisos.costes;
  const total = l.reduce((s, d) => s + (d.coste?.total || 0), 0);
  return html`
    <${Cabecera} titulo=${arch ? 'Archived requests' : 'Requests'} onNueva=${() => setNueva(true)}>
      <label class="chk"><input type="checkbox" checked=${arch} onChange=${(e) => setArch(e.target.checked)} /> Show archived</label>
      <select aria-label="Sort by" value=${orden} onChange=${(e) => setOrden(e.target.value)} style="width:auto">
        <option value="actualizado">Sort: last updated</option><option value="prioridad">Sort: priority</option><option value="fin">Sort: end date</option>${costes && html`<option value="coste">Sort: cost</option>`}</select>
    <//>
    <${Filtros} f=${f} setF=${setF} cat=${cat} me=${me} pagina="demandas" />
    <p class="small muted">${l.length} requests${costes && total ? ` · estimated cost ${eur(total)}` : ''}</p>
    <div class="panel tabla-scroll" style="padding:0">
      <table class="t"><thead><tr><th>Request</th><th>Type</th><th>Status</th><th>Priority</th><th>Client</th><th>Manager</th><th>Dates</th><th>Team</th><th>Effort</th>${costes && html`<th>Cost</th>`}<th>Agencies</th></tr></thead>
      <tbody>${l.map((d) => html`<tr class="click" onClick=${() => ir(`#/demanda/${d.id}`)}>
        <td><a href=${`#/demanda/${d.id}`} onClick=${(e) => e.stopPropagation()}><b>${d.titulo}</b></a>${d.n_adjuntos ? html` <span class="small muted" title="Attachments">📎${d.n_adjuntos}</span>` : ''}
          ${d.proyecto && html`<div class="small muted">${d.proyecto}</div>`}</td>
        <td><${BadgeTipo} t=${d.tipo} /></td>
        <td><span class=${`dot e-${d.estado}`}></span> ${estadoNombre(d.estado)}</td>
        <td><${BadgePrio} p=${d.prioridad} />${d.criticidad && html`<div class="small muted">Crit. ${d.criticidad}</div>`}</td>
        <td>${d.cliente || html`<span class="muted">—</span>`}<div class="small muted">${[d.client_family, d.pais && d.pais !== 'España' ? d.pais : ''].filter(Boolean).join(' · ')}</div></td>
        <td class="small">${d.manager || '—'}</td>
        <td class="small">${d.fecha_inicio ? fecha(d.fecha_inicio) : '—'}<br />${d.fecha_fin ? `→ ${fecha(d.fecha_fin)}` : ''}</td>
        <td><${Equipo} d=${d} /></td>
        <td class="small">${dias(d.jornadas)}</td>
        ${costes && html`<td class="small">${eur(d.coste?.total)}${d.coste?.faltan_tarifas ? html` <span class="badge warn" title="Some people have no rate">rates?</span>` : ''}</td>`}
        <td class="small">${d.agencias.length || '—'}</td></tr>`)}
      ${!l.length && html`<tr><td colspan="11" class="muted">No requests with these filters.</td></tr>`}</tbody></table>
    </div>
    ${nueva && html`<${NuevaDemanda} me=${me} cat=${cat} recargaCat=${recargaCat} onClose=${() => setNueva(false)} onCreada=${(id) => { setNueva(false); reload(); ir(`#/demanda/${id}`); }} />`}`;
}

// ---------- Kanban ----------
export function Kanban({ me, cat, recargaCat }) {
  const { data, error, reload } = useDemandas(false);
  const [f, setF] = useFiltros('kanban', me);
  const [over, setOver] = useState(null);
  const [local, setLocal] = useState({});
  const [nueva, setNueva] = useState(false);
  if (error) return html`<div class="panel">Error: ${error.message}</div>`;
  const l = (data || []).filter((d) => pasa(d, { ...f, estado: '' }))
    .sort((a, b) => (ORDEN_PRIO[a.prioridad] ?? 9) - (ORDEN_PRIO[b.prioridad] ?? 9) || (a.fecha_fin || '9').localeCompare(b.fecha_fin || '9'));
  async function mover(id, estado) {
    const d = l.find((x) => x.id === id);
    if (!d || (local[id] || d.estado) === estado) return;
    setLocal((x) => ({ ...x, [id]: estado }));
    try { await api(`demandas/${id}`, { method: 'PUT', body: { estado } }); toast(`“${d.titulo}” → ${estadoNombre(estado)}`); }
    catch (e) { toast(e.message, true); }
    await reload(); setLocal((x) => { const n = { ...x }; delete n[id]; return n; });
  }
  return html`
    <${Cabecera} titulo="Kanban" onNueva=${() => setNueva(true)}>
      <span class="small muted">Drag a card to change its status. People assigned can move their own requests.</span>
    <//>
    <${Filtros} f=${f} setF=${setF} cat=${cat} sinEstado me=${me} pagina="kanban" />
    <div class="kanban k5">
      ${ESTADOS.map(([col, nombre]) => {
        const items = l.filter((d) => (local[d.id] || d.estado) === col);
        return html`<div class=${`col${over === col ? ' drop' : ''}`}
            onDragOver=${(e) => { e.preventDefault(); if (over !== col) setOver(col); }} onDragLeave=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }}
            onDrop=${(e) => { e.preventDefault(); setOver(null); mover(Number(e.dataTransfer.getData('text/plain')), col); }}>
          <h3><span class=${`dot e-${col}`}></span><span>${nombre}</span><span class="badge gris">${items.length}</span></h3>
          <div class="cards">${items.map((d) => html`<${Tarjeta} key=${d.id} d=${d} me=${me} onMover=${mover} />`)}
            ${!items.length && html`<div class="hueco">Drop here</div>`}</div>
        </div>`;
      })}
    </div>
    ${nueva && html`<${NuevaDemanda} me=${me} cat=${cat} recargaCat=${recargaCat} onClose=${() => setNueva(false)} onCreada=${(id) => { setNueva(false); reload(); ir(`#/demanda/${id}`); }} />`}`;
}

function Tarjeta({ d, me, onMover }) {
  return html`<div class=${`card p-${(d.prioridad || '').toLowerCase()} tc-${d.tipo}`} draggable="true"
      onDragStart=${(e) => { e.dataTransfer.setData('text/plain', String(d.id)); e.dataTransfer.effectAllowed = 'move'; e.currentTarget.classList.add('levantada'); }}
      onDragEnd=${(e) => e.currentTarget.classList.remove('levantada')} onClick=${() => ir(`#/demanda/${d.id}`)}>
    <a class="t" href=${`#/demanda/${d.id}`} onClick=${(e) => e.stopPropagation()}>${d.titulo}</a>
    <div class="m"><${BadgeTipo} t=${d.tipo} />${['Crítica', 'Alta'].includes(d.prioridad) && html`<${BadgePrio} p=${d.prioridad} />`}${d.criticidad === 'Alta' && html`<span class="badge bad">Critical impact</span>`}</div>
    ${d.cliente && html`<div class="m cliente-m"><span>${d.cliente}</span>${d.proyecto && html`<span>· ${d.proyecto}</span>`}</div>`}
    <div class="m" style="margin-top:4px">
      ${d.fecha_fin && html`<span class=${d.fecha_fin < hoyISO() && d.estado !== 'done' ? 'bad-t' : ''}>→ ${fecha(d.fecha_fin)}</span>`}
      ${d.jornadas ? html`<span>${dias(d.jornadas)}</span>` : ''}
      ${me.permisos.costes && d.coste?.total ? html`<span>${eur(d.coste.total)}</span>` : ''}
      ${d.agencias.length ? html`<span class="badge gris" title="Agencies">${d.agencias.length} ag.</span>` : ''}
      ${d.n_adjuntos ? html`<span class="small muted">📎${d.n_adjuntos}</span>` : ''}
    </div>
    ${d.estado === 'assigned' && d.personas.some((p) => !p.estimado) && html`<div class="m"><span class="badge warn">${d.personas.filter((p) => !p.estimado).length} to estimate</span></div>`}
    <div class="m" style="margin-top:6px"><${Equipo} d=${d} /><span class="spacer"></span>
      <select class="mover" aria-label=${`Move “${d.titulo}” to`} value="" onClick=${(e) => e.stopPropagation()} onChange=${(e) => { const v = e.target.value; e.target.value = ''; if (v) onMover(d.id, v); }}>
        <option value="">Move to…</option>${ESTADOS.filter(([k]) => k !== d.estado).map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></div>
  </div>`;
}

// ---------- Gantt ----------
const MES = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aFecha = (s) => new Date(`${s}T00:00:00`);
// Fechas de una línea: las suyas o, si no tiene, las de la request
const fechasLinea = (dp, d) => ({ a: dp.inicio || d.fecha_inicio, b: dp.fin || d.fecha_fin });
function Escala({ meses, desde }) {
  const ini = MES(aFecha(desde));
  const fin = new Date(ini.getFullYear(), ini.getMonth() + meses, 1);
  const pos = (s) => Math.min(100, Math.max(0, ((aFecha(s) - ini) / (fin - ini)) * 100));
  const columnas = Array.from({ length: meses }, (_, i) => new Date(ini.getFullYear(), ini.getMonth() + i, 1));
  return { ini, fin, pos, columnas, hoy: pos(hoyISO()), iniISO: isoD(ini), finISO: isoD(fin) };
}
function Barra({ e, a, b, d, texto, titulo }) {
  const fuera = (b || a) < e.iniISO || (a || b) >= e.finISO;
  const x = e.pos(a || b), w = Math.max(e.pos(b || a) - x, 0.8);
  return html`<div class="g-pista">${e.columnas.map(() => html`<i></i>`)}
    ${e.hoy > 0 && e.hoy < 100 && html`<b class="g-hoy" style=${`left:${e.hoy}%`}></b>`}
    ${!fuera && html`<a class=${`g-barra tc-${d.tipo}${d.estado === 'done' ? ' hecha' : ''}${!a || !b ? ' punto' : ''}`} href=${`#/demanda/${d.id}`} style=${`left:${x}%;width:${w}%`} title=${titulo}><span>${texto}</span></a>`}
    ${fuera && html`<span class="g-fuera small muted">${(b || a) < e.iniISO ? `← ended ${fecha(b || a)}` : `starts ${fecha(a || b)} →`}</span>`}
  </div>`;
}
export function Gantt({ me, cat, recargaCat }) {
  const { data, error, reload } = useDemandas(false);
  const [f, setF] = useFiltros('gantt', me);
  const [modo, setModo] = useState(() => { try { return sessionStorage.ganttModoNicole || 'persona'; } catch { return 'persona'; } });   // persona | demanda
  const [vista, setVista] = useState('vivas');   // vivas = en marcha y a la vista (no Done)
  const [meses, setMeses] = useState(6);
  const [desde, setDesde] = useState(() => { const h = new Date(); return isoD(new Date(h.getFullYear(), h.getMonth() - 1, 1)); });
  const [nueva, setNueva] = useState(false);
  useEffect(() => { try { sessionStorage.ganttModoNicole = modo; } catch {} }, [modo]);
  if (error) return html`<div class="panel">Error: ${error.message}</div>`;
  const todas = (data || []).filter((d) => pasa(d, f) && (vista === 'todas' || d.estado !== 'done'));
  const e = Escala({ meses, desde });
  const mover = (n) => { const d = aFecha(desde); setDesde(isoD(new Date(d.getFullYear(), d.getMonth() + n, 1))); };
  const cab = (txt) => html`<div class="g-fila g-cab"><div class="g-lbl">${txt}</div>
    <div class="g-pista">${e.columnas.map((m) => html`<span class=${m.getMonth() === 0 ? 'ano' : ''}>${m.toLocaleDateString('en-GB', { month: 'short' })}${m.getMonth() === 0 || m === e.columnas[0] ? ` ${String(m.getFullYear()).slice(2)}` : ''}</span>`)}</div></div>`;
  let cuerpo, sinFechas;
  if (modo === 'persona') {
    // Una fila por línea, agrupadas por persona: qué tiene cada uno y cuándo queda libre
    const personas = cat.personas.filter((p) => p.activo && (!f.persona || String(p.id) === f.persona));
    const lineas = todas.flatMap((d) => d.personas.map((dp) => ({ dp, d, ...fechasLinea(dp, d) })));
    sinFechas = lineas.filter((x) => !x.a && !x.b);
    cuerpo = html`${cab(`${personas.length} people`)}
      ${personas.map((p) => {
        const suyas = lineas.filter((x) => x.dp.persona_id === p.id && (x.a || x.b)).sort((x, y) => (x.a || x.b).localeCompare(y.a || y.b));
        const libre = suyas.filter((x) => x.d.estado !== 'done').map((x) => x.b || x.a).sort().pop();
        return html`<div class="g-grupo"><div class="g-fila g-persona"><div class="g-lbl"><b>${p.nombre}</b>
            <span class="small muted">${suyas.length ? `${suyas.length} line${suyas.length === 1 ? '' : 's'} · ${libre && libre >= hoyISO() ? `busy until ${fecha(libre)}` : 'free now'}` : 'nothing planned'}</span></div>
            <div class="g-pista">${e.columnas.map(() => html`<i></i>`)}${e.hoy > 0 && e.hoy < 100 && html`<b class="g-hoy" style=${`left:${e.hoy}%`}></b>`}</div></div>
          ${suyas.map(({ dp, d, a, b }) => html`<div class="g-fila" key=${dp.id}>
            <div class="g-lbl sub"><a href=${`#/demanda/${d.id}`}>${d.titulo}</a><span class="small muted">${[dp.agencia_id && cat.agencias.find((x) => x.id === dp.agencia_id)?.nombre, d.cliente, estadoNombre(d.estado)].filter(Boolean).join(' · ')}</span></div>
            <${Barra} e=${e} a=${a} b=${b} d=${d} texto=${dp.jornadas ? dias(dp.jornadas) : !dp.estimado ? 'to estimate' : ''}
              titulo=${`${p.nombre} · ${d.titulo}${dp.funcion ? ` · ${dp.funcion}` : ''} · ${fecha(a) || '?'} → ${fecha(b) || '?'}${dp.jornadas ? ` · ${dias(dp.jornadas)}` : ''}`} /></div>`)}
        </div>`;
      })}
      ${!personas.length && html`<p class="muted" style="padding:12px">No people in the team yet.</p>`}`;
  } else {
    const conFechas = todas.filter((d) => d.fecha_inicio || d.fecha_fin).sort((a, b) => (a.fecha_inicio || a.fecha_fin).localeCompare(b.fecha_inicio || b.fecha_fin));
    sinFechas = todas.filter((d) => !d.fecha_inicio && !d.fecha_fin).map((d) => ({ d }));
    cuerpo = html`${cab(`${conFechas.length} requests with dates`)}
      ${conFechas.map((d) => html`<div class="g-fila" key=${d.id}>
        <div class="g-lbl"><a href=${`#/demanda/${d.id}`}>${d.titulo}</a><span class="small muted">${[d.cliente, estadoNombre(d.estado)].filter(Boolean).join(' · ')}</span></div>
        <${Barra} e=${e} a=${d.fecha_inicio} b=${d.fecha_fin} d=${d} texto=${d.personas.map((p) => iniciales(p.nombre)).join(' ')}
          titulo=${`${d.titulo} · ${tipoNombre(d.tipo)} · ${fecha(d.fecha_inicio) || '?'} → ${fecha(d.fecha_fin) || '?'}${d.personas.length ? ` · ${d.personas.map((p) => p.nombre).join(', ')}` : ''}`} /></div>`)}
      ${!conFechas.length && html`<p class="muted" style="padding:12px">No requests with dates and these filters.</p>`}`;
  }
  return html`
    <${Cabecera} titulo="Gantt" onNueva=${() => setNueva(true)}>
      <div class="seg" role="group" aria-label="Rows">
        <button aria-pressed=${modo === 'persona'} onClick=${() => setModo('persona')}>By person</button>
        <button aria-pressed=${modo === 'demanda'} onClick=${() => setModo('demanda')}>By request</button></div>
      <div class="seg" role="group" aria-label="Which requests">
        <button aria-pressed=${vista === 'vivas'} onClick=${() => setVista('vivas')}>Open</button>
        <button aria-pressed=${vista === 'todas'} onClick=${() => setVista('todas')}>Include done</button></div>
      <div class="seg" role="group" aria-label="Time window">
        <button onClick=${() => mover(-3)} aria-label="3 months earlier">‹</button>
        <button onClick=${() => { const h = new Date(); setDesde(isoD(new Date(h.getFullYear(), h.getMonth() - 1, 1))); }}>Today</button>
        <button onClick=${() => mover(3)} aria-label="3 months later">›</button></div>
      <select aria-label="Months shown" value=${meses} onChange=${(ev) => setMeses(Number(ev.target.value))} style="width:auto">${[3, 6, 9, 12, 18].map((n) => html`<option value=${n}>${n} months</option>`)}</select>
    <//>
    <${Filtros} f=${f} setF=${setF} cat=${cat} me=${me} pagina="gantt" extra=${{ modo }} onExtra=${(x) => x.modo && setModo(x.modo)} />
    <div class="leyenda-tipos small">${TIPOS.map(([k, n]) => html`<span><i class=${`tc-${k}`}></i>${n}</span>`)}</div>
    <div class=${`panel gantt${modo === 'persona' ? ' por-persona' : ''}`} style=${`--meses:${meses}`}>${cuerpo}</div>
    ${sinFechas.length > 0 && html`<details class="panel"><summary><b>${sinFechas.length} ${modo === 'persona' ? 'lines' : 'requests'} without dates</b> <span class="small muted">add dates to the request or to each line to see them here</span></summary>
      <ul>${sinFechas.map(({ d, dp }) => html`<li><a href=${`#/demanda/${d.id}`}>${d.titulo}</a> <span class="small muted">· ${dp ? `${cat.personas.find((p) => p.id === dp.persona_id)?.nombre || ''} · ` : ''}${tipoNombre(d.tipo)} · ${estadoNombre(d.estado)}</span></li>`)}</ul></details>`}
    ${nueva && html`<${NuevaDemanda} me=${me} cat=${cat} recargaCat=${recargaCat} onClose=${() => setNueva(false)} onCreada=${(id) => { setNueva(false); reload(); ir(`#/demanda/${id}`); }} />`}`;
}

// ---------- Capacidad ----------
// Carga mensual de cada persona = Σ dedicación × (días laborables de la demanda en ese mes / días laborables del mes).
// Dedicación: la indicada en la demanda o, si no, jornadas / días laborables de la demanda. Cuentan las demandas no Done.
const laborables = (a, b) => { let n = 0; for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (d.getDay() % 6) n++; return n; };
export function cargaPersonas(demandas, personas, meses) {
  const out = {};
  for (const p of personas) out[p.id] = meses.map(() => ({ pct: 0, demandas: [] }));
  const sinPlan = {};
  for (const d of demandas) {
    if (d.estado === 'done') continue;
    for (const dp of d.personas) {
      if (!out[dp.persona_id]) continue;
      const fl = fechasLinea(dp, d);
      if (!fl.a || !fl.b) { sinPlan[dp.persona_id] = (sinPlan[dp.persona_id] || 0) + (Number(dp.jornadas) || 0); continue; }
      const a = aFecha(fl.a), b = aFecha(fl.b);
      const totalLab = Math.max(1, laborables(a, b));
      const ded = dp.dedicacion != null ? dp.dedicacion : dp.jornadas ? Math.min(100, (dp.jornadas / totalLab) * 100) : 0;
      if (!ded) continue;
      meses.forEach((m, i) => {
        const mi = m, mf = new Date(m.getFullYear(), m.getMonth() + 1, 0);
        const ia = a > mi ? a : mi, ib = b < mf ? b : mf;
        if (ia > ib) return;
        const pct = ded * (laborables(ia, ib) / Math.max(1, laborables(mi, mf)));
        out[dp.persona_id][i].pct += pct;
        out[dp.persona_id][i].demandas.push(`${d.titulo} (${Math.round(pct)}%)`);
      });
    }
  }
  return { out, sinPlan };
}
export function Capacidad({ me, cat }) {
  const { data, error } = useDemandas(false);
  const [n, setN] = useState(6);
  if (error) return html`<div class="panel">Error: ${error.message}</div>`;
  const h = new Date();
  const meses = Array.from({ length: n }, (_, i) => new Date(h.getFullYear(), h.getMonth() + i, 1));
  const personas = cat.personas.filter((p) => p.activo);
  const { out, sinPlan } = cargaPersonas(data || [], personas, meses);
  const media = meses.map((_, i) => {
    const cap = personas.reduce((s, p) => s + (p.capacidad || 0), 0);
    return cap ? Math.round((personas.reduce((s, p) => s + Math.min(out[p.id][i].pct, 999), 0) / cap) * 100) : 0;
  });
  return html`
    <div class="row" style="margin-bottom:12px"><h1 style="margin:0">Capacity</h1><span class="spacer"></span>
      <select aria-label="Months" value=${n} onChange=${(e) => setN(Number(e.target.value))} style="width:auto">${[3, 6, 9, 12].map((x) => html`<option value=${x}>${x} months</option>`)}</select></div>
    <p class="small muted">Monthly load of each person against their capacity, from the requests that are not Done. Each line uses its own dates (or the request's) and its dedication or, if empty, its days spread over its working days.
      ${me.admin ? html` Add people and their capacity in <a href="#/maestros/personas">Lists › Team</a>.` : ''}</p>
    ${!personas.length ? html`<div class="panel"><p>There are no people in the team yet.${me.admin ? html` <a href="#/maestros/personas">Add them</a>.` : ' Ask the admin to add them.'}</p></div>` : html`
    <div class="panel tabla-scroll" style="padding:0"><table class="t capacidad">
      <thead><tr><th>Person</th><th>Capacity</th>${meses.map((m) => html`<th>${m.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</th>`)}<th>Days without dates</th></tr></thead>
      <tbody>${personas.map((p) => html`<tr><td><b>${p.nombre}</b><div class="small muted">${rolNombre(p.rol)}</div></td><td class="small">${p.capacidad}%</td>
        ${out[p.id].map((c) => { const r = p.capacidad ? c.pct / p.capacidad : 0; const cls = c.pct === 0 ? 'libre' : r > 1 ? 'sobre' : r > 0.85 ? 'lleno' : 'ok';
          return html`<td><span class=${`carga ${cls}`} title=${c.demandas.join('\n') || 'Free'}>${Math.round(c.pct)}%</span></td>`; })}
        <td class="small">${sinPlan[p.id] ? dias(sinPlan[p.id]) : '—'}</td></tr>`)}
      <tr class="total"><td><b>Team</b></td><td></td>${media.map((x) => html`<td><b>${x}%</b></td>`)}<td></td></tr></tbody></table></div>
    <p class="small muted"><span class="carga ok">ok</span> below 85% · <span class="carga lleno">full</span> 85-100% · <span class="carga sobre">over</span> above capacity</p>`}`;
}

// ---------- Cliente, proyecto y contactos (selects en cascada con alta rápida) ----------
function CamposCliente({ v, set, cat, recargaCat, puedeMaestros, conCuenta = true }) {
  const cli = cat.clientes.find((c) => c.id === Number(v.cliente_id));
  const [sector, setSector] = useState(cli?.sector || '');
  const [family, setFamily] = useState(cli?.client_family || '');
  useEffect(() => { if (cli) { setSector(cli.sector || ''); setFamily(cli.client_family || ''); } }, [v.cliente_id]);
  const [alta, setAlta] = useState(null);
  const families = unicos(cat.clientes.filter((c) => !sector || c.sector === sector).map((c) => c.client_family));
  const clientes = cat.clientes.filter((c) => (c.activo || c.id === Number(v.cliente_id)) && (!sector || c.sector === sector) && (!family || c.client_family === family));
  const proyectos = cat.proyectos.filter((p) => p.cliente_id === Number(v.cliente_id) && (p.activo || p.id === Number(v.proyecto_id)));
  const managers = cat.contactos.filter((c) => c.es_manager && (c.activo || c.id === Number(v.manager_id)));
  async function creado(tipo, id) { await recargaCat(); if (tipo === 'cliente') set({ cliente_id: id, proyecto_id: '' }); if (tipo === 'proyecto') set({ proyecto_id: id }); if (tipo === 'manager') set({ manager_id: id }); setAlta(null); }
  return html`<div class="grid">
    <label class="f"><span>Sector</span><select value=${sector} onChange=${(e) => { setSector(e.target.value); setFamily(''); }}><option value="">All sectors</option>${cat.sectores.map((s) => html`<option value=${s}>${s}</option>`)}</select></label>
    <label class="f"><span>Client family</span><select value=${family} onChange=${(e) => setFamily(e.target.value)}><option value="">All families</option>${families.map((s) => html`<option value=${s}>${s}</option>`)}</select></label>
    <label class="f"><span>Client / account</span><select value=${v.cliente_id || ''} onChange=${(e) => set({ cliente_id: e.target.value ? Number(e.target.value) : '', proyecto_id: '' })}>
      <option value="">—</option>${clientes.map((c) => html`<option value=${c.id}>${c.nombre}${c.codigo ? ` · ${c.codigo}` : ''}</option>`)}</select>
      ${puedeMaestros && html`<button type="button" class="link" onClick=${() => setAlta('cliente')}>+ New client</button>`}</label>
    <label class="f"><span>Country</span><select value=${v.pais || ''} onChange=${(e) => set({ pais: e.target.value })}>
      <option value="">${cli?.pais ? `${cli.pais} (client's)` : '—'}</option>${cat.paises.map((p) => html`<option value=${p}>${p}</option>`)}</select></label>
    <label class="f"><span>Project</span><select value=${v.proyecto_id || ''} disabled=${!v.cliente_id} onChange=${(e) => { const p = cat.proyectos.find((x) => x.id === Number(e.target.value)); set({ proyecto_id: e.target.value ? Number(e.target.value) : '', ...(p?.cuenta_cargo && !v.cuenta_cargo ? { cuenta_cargo: p.cuenta_cargo } : {}) }); }}>
      <option value="">—</option>${proyectos.map((p) => html`<option value=${p.id}>${p.nombre}${p.codigo ? ` · ${p.codigo}` : ''}</option>`)}</select>
      ${puedeMaestros && v.cliente_id && html`<button type="button" class="link" onClick=${() => setAlta('proyecto')}>+ New project in ${cli?.nombre || 'this client'}</button>`}</label>
    ${conCuenta && html`<label class="f"><span>Charge account</span><input value=${v.cuenta_cargo || ''} onInput=${(e) => set({ cuenta_cargo: e.target.value })} placeholder="If there is one" /></label>`}
    <label class="f"><span>Responsible manager</span><select value=${v.manager_id || ''} onChange=${(e) => set({ manager_id: e.target.value ? Number(e.target.value) : '' })}>
      <option value="">—</option>${managers.map((c) => html`<option value=${c.id}>${c.nombre}</option>`)}</select>
      ${puedeMaestros && html`<button type="button" class="link" onClick=${() => setAlta('manager')}>+ New manager</button>`}</label>
    <label class="f"><span>Sponsor</span><input value=${v.sponsor || ''} onInput=${(e) => set({ sponsor: e.target.value })} placeholder="Who asks for it at the client" /></label>
    ${alta && html`<${AltaRapida} tipo=${alta} cat=${cat} cliente=${cli} sector=${sector} family=${family} onClose=${() => setAlta(null)} onCreado=${creado} />`}
  </div>`;
}

export function AltaRapida({ tipo, cat, cliente, sector, family, onClose, onCreado, area }) {
  const [v, setV] = useState({ nombre: '', codigo: '', sector: sector || '', client_family: family || '', pais: 'España', cuenta_cargo: '', email: '', area: area || (tipo === 'manager' ? 'Manager' : 'Otro') });
  const [busy, setBusy] = useState(false);
  const s = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const titulo = { cliente: 'New client', proyecto: `New project in ${cliente?.nombre || ''}`, manager: 'New manager', contacto: 'New contact' }[tipo];
  async function guardar(e) {
    e.preventDefault(); setBusy(true);
    try {
      let r;
      if (tipo === 'cliente') r = await api('clientes', { method: 'POST', body: { nombre: v.nombre, codigo: v.codigo, sector: v.sector, client_family: v.client_family, pais: v.pais } });
      if (tipo === 'proyecto') r = await api('proyectos', { method: 'POST', body: { cliente_id: cliente.id, nombre: v.nombre, codigo: v.codigo, cuenta_cargo: v.cuenta_cargo } });
      if (tipo === 'manager' || tipo === 'contacto') r = await api('contactos', { method: 'POST', body: { nombre: v.nombre, email: v.email, area: v.area, es_manager: tipo === 'manager' || v.area === 'Manager' ? 1 : 0 } });
      toast(`${titulo.replace(/ in .*/, '')} created`); onCreado(tipo, r.id);
    } catch (x) { toast(x.message, true); }
    setBusy(false);
  }
  return html`<div class="modal-bg" onClick=${onClose}><form class="modal estrecho" role="dialog" aria-modal="true" aria-label=${titulo} onClick=${(e) => e.stopPropagation()} onSubmit=${guardar}>
    <h2>${titulo}</h2>
    <div class="grid" style="grid-template-columns:1fr 1fr">
      <label class="f req wide"><span>Name</span><input required autofocus value=${v.nombre} onInput=${s('nombre')} /></label>
      ${tipo === 'cliente' && html`
        <label class="f"><span>Client code</span><input value=${v.codigo} onInput=${s('codigo')} placeholder="e.g. 301962" /></label>
        <label class="f"><span>Country</span><input list="l-paises" value=${v.pais} onInput=${s('pais')} /></label>
        <label class="f"><span>Sector</span><input list="l-sectores" value=${v.sector} onInput=${s('sector')} /></label>
        <datalist id="l-paises">${cat.paises.map((x) => html`<option value=${x} />`)}</datalist>
        <label class="f"><span>Client family</span><input list="l-families" value=${v.client_family} onInput=${s('client_family')} /></label>
        <datalist id="l-sectores">${cat.sectores.map((x) => html`<option value=${x} />`)}</datalist>
        <datalist id="l-families">${unicos(cat.clientes.map((c) => c.client_family)).map((x) => html`<option value=${x} />`)}</datalist>`}
      ${tipo === 'proyecto' && html`
        <label class="f"><span>Project code</span><input value=${v.codigo} onInput=${s('codigo')} placeholder="e.g. EXT-…" /></label>
        <label class="f"><span>Charge account</span><input value=${v.cuenta_cargo} onInput=${s('cuenta_cargo')} /></label>`}
      ${(tipo === 'manager' || tipo === 'contacto') && html`
        <label class="f"><span>Email</span><input type="email" value=${v.email} onInput=${s('email')} /></label>
        ${tipo === 'contacto' && html`<label class="f"><span>Area</span><select value=${v.area} onChange=${s('area')}>${cat.areas_contacto.map((a) => html`<option value=${a}>${a}</option>`)}</select></label>`}`}
    </div>
    <div class="row" style="margin-top:14px"><span class="spacer"></span><button type="button" onClick=${onClose}>Cancel</button><button class="primary" type="submit" disabled=${busy || !v.nombre.trim()}>Create</button></div>
  </form></div>`;
}

// ---------- Agencias (chips agrupadas por dominio) ----------
function SelectorAgencias({ sel, onCambia, cat, disabled }) {
  const dominios = unicos(cat.agencias.map((a) => a.dominio));
  const alterna = (id) => onCambia(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return html`<div class="agencias-sel">${dominios.map((dm) => html`<div><div class="small muted">${dm}</div><div class="chips">
    ${cat.agencias.filter((a) => a.dominio === dm && (a.activo || sel.includes(a.id))).map((a) => html`<button type="button" class=${`chip${sel.includes(a.id) ? ' on' : ''}`} aria-pressed=${sel.includes(a.id)}
      disabled=${disabled} title=${`${a.resumen || ''} (${a.madurez})`} onClick=${() => alterna(a.id)}>${a.nombre}</button>`)}</div></div>`)}</div>`;
}

function SelectorContactos({ sel, onCambia, cat, etiqueta, puedeMaestros, area }) {
  const [q, setQ] = useState('');
  const [alta, setAlta] = useState(false);
  const elegidos = sel.map((id) => cat.contactos.find((c) => c.id === id)).filter(Boolean);
  const opciones = cat.contactos.filter((c) => c.activo && !sel.includes(c.id) && (!q || sinT(`${c.nombre} ${c.area} ${c.email}`).includes(sinT(q)))).slice(0, 8);
  return html`<div>
    <div class="chips">${elegidos.map((c) => html`<span class="chip on">${c.nombre}${c.area ? html` <span class="small muted">${c.area}</span>` : ''}
      <button type="button" class="x" aria-label=${`Remove ${c.nombre}`} onClick=${() => onCambia(sel.filter((x) => x !== c.id))}>×</button></span>`)}
      ${!elegidos.length && html`<span class="small muted">Nobody yet</span>`}</div>
    <div class="row" style="margin-top:6px"><input style="max-width:260px" aria-label=${`Add to ${etiqueta}`} placeholder="Type a name to add…" value=${q} onInput=${(e) => setQ(e.target.value)} />
      ${puedeMaestros && html`<button type="button" class="link" onClick=${() => setAlta(true)}>+ New contact</button>`}</div>
    ${q && html`<div class="chips" style="margin-top:6px">${opciones.map((c) => html`<button type="button" class="chip" onClick=${() => { onCambia([...sel, c.id]); setQ(''); }}>+ ${c.nombre}${c.area ? ` · ${c.area}` : ''}</button>`)}
      ${!opciones.length && html`<span class="small muted">No matches</span>`}</div>`}
    ${alta && html`<${AltaRapida} tipo="contacto" area=${area} cat=${cat} onClose=${() => setAlta(false)} onCreado=${async (_, id) => { setAlta(false); await window.recargaCatNicole?.(); onCambia([...sel, id]); }} />`}
  </div>`;
}

// ---------- Líneas: quién hace qué agencia o trabajo, con su estimación ----------
// Quien puede asignar edita todas las líneas y se guardan con la request. Cada persona asignada estima la suya con «Save my estimate».
const LINEA_VACIA = { persona_id: '', agencia_id: '', funcion: '', jornadas: null, dedicacion: null, inicio: '', fin: '' };
function LineasDemanda({ v, set, cat, me, coste, original, onEstimada, nueva }) {
  const filas = v.personas || [];
  const asignar = me.permisos.asignar;
  const mia = (p) => cat.personas.find((x) => x.id === Number(p.persona_id))?.email?.toLowerCase() === me.email;
  const cambia = (i, k, val) => set({ personas: filas.map((p, j) => (j === i ? { ...p, [k]: val } : p)) });
  const lin = (p) => coste?.lineas?.find((x) => x.id === p.id);
  const agencias = cat.agencias.filter((a) => a.activo || filas.some((p) => p.agencia_id === a.id));
  const deLaRequest = new Set(v.agencias || []);
  async function estimaMia(p) {
    try { await api(`lineas/${p.id}`, { method: 'PUT', body: { jornadas: p.jornadas, dedicacion: p.dedicacion, inicio: p.inicio, fin: p.fin, funcion: p.funcion } }); toast('Estimate saved'); onEstimada?.(); }
    catch (x) { toast(x.message, true); }
  }
  return html`<div class="tabla-scroll">
    <table class="t equipo-t"><thead><tr><th>Person</th><th>Agency / piece of work</th><th>What to do</th><th>Days</th><th>Ded. %</th><th>Start</th><th>End</th>${!nueva && html`<th>Estimate</th>`}${me.permisos.costes && !nueva && html`<th>Cost</th>`}<th></th></tr></thead>
    <tbody>${filas.map((p, i) => {
      const per = cat.personas.find((x) => x.id === Number(p.persona_id));
      const ed = asignar || (mia(p) && p.id);
      const orig = original?.find((x) => x.id === p.id);
      const firma = (x) => { const y = aLinea(x); return JSON.stringify([y.jornadas, y.dedicacion, y.inicio, y.fin, y.funcion]); };
      const tocada = !asignar && mia(p) && orig && firma(orig) !== firma(p);
      return html`<tr class=${mia(p) ? 'mia' : ''}>
      <td>${asignar ? html`<select aria-label="Person" value=${p.persona_id || ''} onChange=${(e) => cambia(i, 'persona_id', Number(e.target.value))}>
          <option value="">—</option>${cat.personas.filter((x) => x.activo || x.id === Number(p.persona_id)).map((x) => html`<option value=${x.id}>${x.nombre}</option>`)}</select>`
        : html`<b>${per?.nombre || p.nombre || '?'}</b>`}${mia(p) ? html`<div class="small ok-t">you</div>` : ''}</td>
      <td><select aria-label="Agency" value=${p.agencia_id || ''} disabled=${!asignar} onChange=${(e) => cambia(i, 'agencia_id', e.target.value)}>
        <option value="">General / other work</option>
        ${agencias.filter((a) => deLaRequest.has(a.id)).map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}
        <optgroup label="Other agencies">${agencias.filter((a) => !deLaRequest.has(a.id)).map((a) => html`<option value=${a.id}>${a.nombre}</option>`)}</optgroup></select></td>
      <td><input aria-label="What to do" value=${p.funcion || ''} disabled=${!ed} onInput=${(e) => cambia(i, 'funcion', e.target.value)} placeholder="e.g. build the coverage agency with the CoE" /></td>
      <td><input aria-label="Days" type="number" min="0" step="0.5" style="width:76px" value=${p.jornadas ?? ''} disabled=${!ed} onInput=${(e) => cambia(i, 'jornadas', e.target.value === '' ? null : Number(e.target.value))} /></td>
      <td><input aria-label="Dedication %" type="number" min="0" max="100" style="width:66px" value=${p.dedicacion ?? ''} disabled=${!ed} placeholder="auto" onInput=${(e) => cambia(i, 'dedicacion', e.target.value === '' ? null : Number(e.target.value))} /></td>
      <td><input aria-label="Start" type="date" value=${p.inicio || ''} disabled=${!ed} onInput=${(e) => cambia(i, 'inicio', e.target.value)} /></td>
      <td><input aria-label="End" type="date" value=${p.fin || ''} disabled=${!ed} onInput=${(e) => cambia(i, 'fin', e.target.value)} /></td>
      ${!nueva && html`<td>${p.id && orig?.estimado ? html`<span class="badge ok">Estimated</span>` : p.id ? html`<span class="badge warn">To estimate</span>` : html`<span class="badge gris">New</span>`}
        ${tocada && html`<div><button type="button" class="primary small" onClick=${() => estimaMia(p)}>Save my estimate</button></div>`}</td>`}
      ${me.permisos.costes && !nueva && html`<td class="small">${lin(p)?.coste ? eur(lin(p).coste) : lin(p) && !lin(p).tarifa && p.jornadas ? html`<span class="badge warn">no rate</span>` : '—'}</td>`}
      <td>${asignar && html`<button type="button" class="ghost" aria-label="Remove line" onClick=${() => set({ personas: filas.filter((_, j) => j !== i) })}>×</button>`}</td></tr>`; })}
      ${!filas.length && html`<tr><td colspan="10" class="muted small">Nobody assigned yet.${asignar ? ' Add a line per agency or piece of work and choose who does it.' : ''}</td></tr>`}</tbody></table>
    ${asignar && html`<div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
      <button type="button" onClick=${() => set({ personas: [...filas, { ...LINEA_VACIA }] })}>+ Add a line</button>
      ${(v.agencias || []).filter((a) => !filas.some((p) => p.agencia_id === a)).length > 0 && html`<button type="button" class="link"
        onClick=${() => set({ personas: [...filas, ...(v.agencias || []).filter((a) => !filas.some((p) => p.agencia_id === a)).map((a) => ({ ...LINEA_VACIA, agencia_id: a }))] })}>+ One line per selected agency</button>`}
      ${!cat.personas.length && html`<span class="small muted">${me.admin ? html`Add your team in <a href="#/maestros/personas">Lists › Team</a>.` : 'The admin has not added the team yet.'}</span>`}</div>`}
    ${!asignar && !nueva && html`<p class="small muted">Directors and PMs assign the lines. If a line is yours, fill in days and dates and press «Save my estimate».</p>`}
  </div>`;
}

// ---------- Ficha de una demanda ----------
const aLinea = (p) => ({ id: p.id, persona_id: p.persona_id, agencia_id: p.agencia_id || '', funcion: p.funcion || '', jornadas: p.jornadas, dedicacion: p.dedicacion, inicio: p.inicio || '', fin: p.fin || '' });
const aForm = (d) => ({ ...d, pais: d.pais_propio || '', personas: d.personas.map(aLinea),
  informar: d.informar.map((x) => x.id), otros: d.otros.map((x) => x.id) });
export function Demanda({ id, me, cat, recargaCat }) {
  const { data, error, reload } = useAsync(() => api(`demandas/${id}`), [id]);
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setV(aForm(data)); }, [data]);
  if (error) return html`<div class="panel"><h2>Cannot open this request</h2><p>${error.message}</p><a href="#/demandas">Back to requests</a></div>`;
  if (!v) return html`<p class="cargando">Loading…</p>`;
  const set = (o) => setV((x) => ({ ...x, ...o }));
  const cambiado = JSON.stringify(aForm(data)) !== JSON.stringify(v);
  const asignado = data.personas.some((p) => String(p.email || '').toLowerCase() === me.email);
  const editable = me.permisos.editar || asignado;
  const soloLineas = JSON.stringify({ ...aForm(data), personas: [] }) === JSON.stringify({ ...v, personas: [] });
  async function guardar() {
    setBusy(true);
    try {
      const body = { ...v };
      for (const k of ['cliente', 'sector', 'client_family', 'pais_propio', 'cliente_pais', 'cliente_codigo', 'proyecto', 'manager', 'creado_por_usuario', 'n_adjuntos', 'agencias_n', 'coste', 'jornadas', 'adjuntos', 'eventos', 'id', 'creado', 'actualizado', 'creado_por']) delete body[k];
      if (!me.permisos.asignar) delete body.personas;
      if (!me.permisos.priorizar) delete body.prioridad;
      if (!me.permisos.costes) delete body.importe;
      await api(`demandas/${id}`, { method: 'PUT', body }); toast('Saved'); await reload();
    } catch (x) { toast(x.message, true); }
    setBusy(false);
  }
  async function archivar() {
    try { await api(`demandas/${id}`, { method: 'PUT', body: { archivada: data.archivada ? 0 : 1 } }); toast(data.archivada ? 'Unarchived' : 'Archived'); reload(); } catch (x) { toast(x.message, true); }
  }
  async function borrar() {
    if (!confirm(`Delete “${data.titulo}” and its attachments? This cannot be undone.`)) return;
    try { await api(`demandas/${id}`, { method: 'DELETE' }); toast('Deleted'); ir('#/demandas'); } catch (x) { toast(x.message, true); }
  }
  const estados = ESTADOS;
  const c = data.coste;
  const cli = cat.clientes.find((x) => x.id === Number(v.cliente_id));
  const sugerida = sugierePrioridad(cli, v.pais, cat.reglas_prioridad);
  return html`
    <p class="small"><a href="#/demandas">← Requests</a> · <a href="#/kanban">Kanban</a> · <a href="#/gantt">Gantt</a></p>
    <div class="row cab-demanda">
      <h1 style="margin:0;flex:1;min-width:260px"><input class="titulo-in" aria-label="Title" value=${v.titulo} disabled=${!editable} onInput=${(e) => set({ titulo: e.target.value })} /></h1>
      <select aria-label="Status" style="width:auto" value=${v.estado} disabled=${!editable} onChange=${(e) => set({ estado: e.target.value })}>${estados.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
      ${me.permisos.priorizar && html`<button onClick=${archivar} title="Discarded or finished requests go to the archive">${data.archivada ? 'Unarchive' : 'Discard / archive'}</button>`}
      ${me.admin && html`<button class="danger" onClick=${borrar}>Delete</button>`}
      <button class="primary" disabled=${!cambiado || busy || !editable || (soloLineas && !me.permisos.asignar)} onClick=${guardar}>${busy ? 'Saving…' : cambiado ? 'Save changes' : 'Saved'}</button>
    </div>
    <p class="small muted">#${data.id} · created ${fecha(data.creado)} by ${data.creado_por_usuario || '—'} · updated ${fecha(data.actualizado)}${data.archivada ? ' · archived' : ''}${!editable ? ' · read only' : ''}</p>
    <section class="panel"><h2>Who does what · estimate</h2>
      <${LineasDemanda} v=${v} set=${set} cat=${cat} me=${me} coste=${c} original=${data.personas} onEstimada=${reload} /></section>
    <div class="cols2">
      <div>
        <section class="panel"><h2>Request</h2><div class="grid">
          <label class="f req"><span>Type</span><select value=${v.tipo} disabled=${!editable} onChange=${(e) => set({ tipo: e.target.value })}>${TIPOS.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
          <label class="f"><span>Priority${!me.permisos.priorizar ? ' (directors)' : ''}</span><select value=${v.prioridad || ''} disabled=${!me.permisos.priorizar} onChange=${(e) => set({ prioridad: e.target.value })}>
            ${cat.prioridades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select>
            ${sugerida && sugerida !== v.prioridad && html`<span class="small muted">Rules suggest ${PRIO_EN[sugerida]}${me.permisos.priorizar ? html` · <button type="button" class="link" onClick=${() => set({ prioridad: sugerida })}>apply</button>` : ''}</span>`}</label>
          <label class="f"><span>Criticality</span><select value=${v.criticidad || ''} disabled=${!editable} onChange=${(e) => set({ criticidad: e.target.value })}><option value="">—</option>${cat.criticidades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select></label>
          <label class="f"><span>Technologies (comma-separated)</span><input list="l-tecs" value=${v.tecnologias || ''} disabled=${!editable} onInput=${(e) => set({ tecnologias: e.target.value })} placeholder="e.g. Playwright, GenAI, Tosca" />
            <datalist id="l-tecs">${cat.tecnologias.map((t) => html`<option value=${t} />`)}</datalist></label>
          <label class="f wide"><span>Description</span><textarea rows="5" value=${v.descripcion || ''} disabled=${!editable} onInput=${(e) => set({ descripcion: e.target.value })}></textarea></label>
          <label class="f wide"><span>Expected benefit</span><textarea rows="2" value=${v.beneficio || ''} disabled=${!editable} onInput=${(e) => set({ beneficio: e.target.value })}></textarea></label>
          <label class="f wide"><span>Notes</span><textarea rows="2" value=${v.notas || ''} disabled=${!editable} onInput=${(e) => set({ notas: e.target.value })}></textarea></label>
        </div></section>
        <section class="panel"><h2>Client and people</h2>
          <${CamposCliente} v=${v} set=${set} cat=${cat} recargaCat=${recargaCat} puedeMaestros=${me.permisos.maestros && editable} />
          <div class="grid" style="margin-top:14px">
            <div class="wide"><div class="small muted" style="margin-bottom:4px">People to inform</div>
              <${SelectorContactos} sel=${v.informar} onCambia=${(l) => set({ informar: l })} cat=${cat} etiqueta="people to inform" puedeMaestros=${me.permisos.maestros} /></div>
            <div class="wide"><div class="small muted" style="margin-bottom:4px">Other contacts (sector, AS…)</div>
              <${SelectorContactos} sel=${v.otros} onCambia=${(l) => set({ otros: l })} cat=${cat} etiqueta="other contacts" area="Sector" puedeMaestros=${me.permisos.maestros} /></div>
          </div></section>
        <section class="panel"><h2>Agencies to implement or show</h2>
          <${SelectorAgencias} sel=${v.agencias} onCambia=${(l) => set({ agencias: l })} cat=${cat} disabled=${!editable} /></section>
      </div>
      <div>
        <section class="panel"><h2>Planning</h2><div class="grid" style="grid-template-columns:1fr 1fr">
          <label class="f"><span>Requested on</span><input type="date" value=${v.fecha_solicitud || ''} disabled=${!editable} onInput=${(e) => set({ fecha_solicitud: e.target.value })} /></label>
          <span></span>
          <label class="f"><span>Start</span><input type="date" value=${v.fecha_inicio || ''} disabled=${!editable} onInput=${(e) => set({ fecha_inicio: e.target.value })} /></label>
          <label class="f"><span>End</span><input type="date" value=${v.fecha_fin || ''} disabled=${!editable} onInput=${(e) => set({ fecha_fin: e.target.value })} /></label>
          <label class="f"><span>Overall estimate (days)</span><input type="number" min="0" step="0.5" value=${v.esfuerzo_estimado ?? ''} disabled=${!editable}
            onInput=${(e) => set({ esfuerzo_estimado: e.target.value === '' ? null : Number(e.target.value) })} placeholder="If not split by person" /></label>
          ${me.permisos.costes && html`<label class="f"><span>Opportunity value (€)</span><input type="number" min="0" value=${v.importe ?? ''} disabled=${!editable} onInput=${(e) => set({ importe: e.target.value === '' ? null : Number(e.target.value) })} /></label>`}
        </div></section>
        ${me.permisos.costes && html`<section class="panel coste-panel"><h2>Implementation cost</h2>
          <div class="coste-n">${eur(c?.total)}</div>
          <p class="small muted">${c?.jornadas ? `${dias(c.jornadas)} ${c.base === 'estimado' ? 'from the overall estimate × average rate' : 'from the team estimate × each rate'}` : 'Add people and days, or an overall estimate, to calculate it.'}
            ${c?.faltan_tarifas ? html`<br /><span class="badge warn">Missing rates</span> ${me.admin ? html`set them in <a href="#/ajustes">Settings</a> or on each person` : 'ask the admin to set the rates'}.` : ''}</p>
          ${cambiado && html`<p class="small warn-t">Save to recalculate.</p>`}
          ${data.importe ? html`<p class="small">Opportunity value ${eur(data.importe)}</p>` : ''}</section>`}
        <${Adjuntos} d=${data} cat=${cat} onCambio=${reload} />
        <section class="panel"><h2>History</h2>${data.eventos.map((e) => html`<div class="evento"><b>${fecha(e.fecha)}</b> · ${e.usuario} · ${e.detalle || e.accion}</div>`)}
          ${!data.eventos.length && html`<p class="small muted">No changes yet.</p>`}</section>
      </div>
    </div>
    ${cambiado && !(soloLineas && !me.permisos.asignar) && html`<div class="barra-guardar"><span>You have unsaved changes</span><button onClick=${() => setV(aForm(data))}>Discard</button><button class="primary" disabled=${busy} onClick=${guardar}>Save changes</button></div>`}`;
}

function Adjuntos({ d, cat, onCambio }) {
  const [tipo, setTipo] = useState('Presentación');
  const [busy, setBusy] = useState(false);
  async function sube(e) {
    const files = [...(e.target.files || [])]; e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) { toast(`${file.name}: too large (max 25 MB)`, true); continue; }
      try { await api(`demandas/${d.id}/adjuntos`, { method: 'POST', body: { nombre: file.name, mime: file.type, tipo_doc: tipo, datos: await leeBase64(file) } }); toast(`${file.name} uploaded`); }
      catch (x) { toast(`${file.name}: ${x.message}`, true); }
    }
    setBusy(false); onCambio();
  }
  async function borra(a) {
    if (!confirm(`Delete ${a.nombre}?`)) return;
    try { await api(`adjuntos/${a.id}`, { method: 'DELETE' }); onCambio(); } catch (x) { toast(x.message, true); }
  }
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return html`<section class="panel"><h2>Attachments</h2>
    <ul class="adjuntos">${d.adjuntos.map((a) => html`<li><span class="badge gris">${a.tipo_doc || 'Other'}</span>
      <a href=${`/api/adjuntos/${a.id}`} download=${a.nombre}>${a.nombre}</a><span class="small muted">${kb(a.tamano || 0)} · ${a.subido_por} · ${fecha(a.fecha)}</span>
      <button class="ghost" aria-label=${`Delete ${a.nombre}`} onClick=${() => borra(a)}>×</button></li>`)}
      ${!d.adjuntos.length && html`<li class="small muted">Presentations, estimates, technical designs, scopes… nothing yet.</li>`}</ul>
    <div class="row" style="margin-top:8px"><select aria-label="Document type" value=${tipo} onChange=${(e) => setTipo(e.target.value)} style="width:auto">${cat.tipos_doc.map((t) => html`<option value=${t}>${t}</option>`)}</select>
      <label class="btn">${busy ? 'Uploading…' : html`${ICONOS.clip} Attach files`}<input type="file" multiple hidden disabled=${busy} onChange=${sube} /></label></div>
  </section>`;
}

// ---------- Alta de una demanda (formulario o desde audio / notas con IA) ----------
const VACIA = { titulo: '', tipo: 'poc', prioridad: '', criticidad: '', cliente_id: '', proyecto_id: '', manager_id: '', pais: '', sponsor: '', descripcion: '', beneficio: '', tecnologias: '',
  cuenta_cargo: '', importe: '', esfuerzo_estimado: '', fecha_inicio: '', fecha_fin: '', notas: '', agencias: [], personas: [] };
export function NuevaDemanda({ me, cat, recargaCat, onClose, onCreada, deAudio }) {
  const [v, setV] = useState(VACIA);
  const [busy, setBusy] = useState(false);
  const [ia, setIa] = useState(false);
  const [prioManual, setPrioManual] = useState(false);
  const set = (o) => setV((x) => ({ ...x, ...o }));
  const cli = cat.clientes.find((x) => x.id === Number(v.cliente_id));
  const sugerida = sugierePrioridad(cli, v.pais, cat.reglas_prioridad);
  useEffect(() => { if (!prioManual && sugerida) set({ prioridad: sugerida }); }, [sugerida]);
  async function crear(e) {
    e.preventDefault(); setBusy(true);
    try {
      const body = { ...v, origen_ia: ia };
      body.personas = me.permisos.asignar ? v.personas.filter((p) => p.persona_id) : undefined;
      if (!me.permisos.costes) delete body.importe;
      const r = await api('demandas', { method: 'POST', body }); toast('Request created'); onCreada(r.id);
    } catch (x) { toast(x.message, true); }
    setBusy(false);
  }
  return html`<div class="modal-bg" onClick=${onClose}><form class="modal ancho" role="dialog" aria-modal="true" aria-labelledby="t-nueva" onClick=${(e) => e.stopPropagation()} onSubmit=${crear}>
    <h2 id="t-nueva">New request</h2>
    <${AsistenteIA} abierto=${deAudio} onRelleno=${(r) => { const o = {}; for (const [k, x] of Object.entries(r)) if (x !== '' && x != null && !(Array.isArray(x) && !x.length)) o[k] = x;
      if (o.lineas) { o.personas = o.lineas.map((l) => ({ ...LINEA_VACIA, ...l })); delete o.lineas; } if (o.prioridad) setPrioManual(true); set(o); setIa(true); }} />
    <div class="grid">
      <label class="f req wide"><span>Title</span><input required value=${v.titulo} onInput=${(e) => set({ titulo: e.target.value })} placeholder="e.g. Set up the TDM and coverage agencies at Tuenti" /></label>
      <label class="f req"><span>Type</span><select value=${v.tipo} onChange=${(e) => set({ tipo: e.target.value })}>${TIPOS.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
      <label class="f"><span>Priority</span><select value=${v.prioridad} disabled=${!me.permisos.priorizar} onChange=${(e) => { setPrioManual(true); set({ prioridad: e.target.value }); }}>
        <option value="">Suggested by the client rules</option>${cat.prioridades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select>
        ${sugerida && html`<span class="small muted">Rules: ${PRIO_EN[sugerida]}${prioManual && v.prioridad !== sugerida ? html` · <button type="button" class="link" onClick=${() => { setPrioManual(false); set({ prioridad: sugerida }); }}>use it</button>` : ''}</span>`}</label>
      <label class="f"><span>Criticality</span><select value=${v.criticidad} onChange=${(e) => set({ criticidad: e.target.value })}><option value="">—</option>${cat.criticidades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select></label>
      <label class="f"><span>Technologies</span><input list="l-tecs-n" value=${v.tecnologias} onInput=${(e) => set({ tecnologias: e.target.value })} /><datalist id="l-tecs-n">${cat.tecnologias.map((t) => html`<option value=${t} />`)}</datalist></label>
    </div>
    <div style="margin-top:12px"><${CamposCliente} v=${v} set=${set} cat=${cat} recargaCat=${recargaCat} puedeMaestros=${me.permisos.maestros} /></div>
    <div class="grid" style="margin-top:12px">
      <label class="f wide"><span>Description</span><textarea rows="4" value=${v.descripcion} onInput=${(e) => set({ descripcion: e.target.value })}></textarea></label>
      <label class="f wide"><span>Expected benefit</span><textarea rows="2" value=${v.beneficio} onInput=${(e) => set({ beneficio: e.target.value })}></textarea></label>
      <label class="f"><span>Start</span><input type="date" value=${v.fecha_inicio} onInput=${(e) => set({ fecha_inicio: e.target.value })} /></label>
      <label class="f"><span>End</span><input type="date" value=${v.fecha_fin} onInput=${(e) => set({ fecha_fin: e.target.value })} /></label>
      <label class="f"><span>Overall estimate (days)</span><input type="number" min="0" step="0.5" value=${v.esfuerzo_estimado} onInput=${(e) => set({ esfuerzo_estimado: e.target.value })} /></label>
      ${me.permisos.costes && html`<label class="f"><span>Opportunity value (€)</span><input type="number" min="0" value=${v.importe} onInput=${(e) => set({ importe: e.target.value })} /></label>`}
      ${v.notas && html`<label class="f wide"><span>Notes</span><textarea rows="2" value=${v.notas} onInput=${(e) => set({ notas: e.target.value })}></textarea></label>`}
    </div>
    <div style="margin-top:12px"><div class="small muted" style="margin-bottom:4px">Agencies</div><${SelectorAgencias} sel=${v.agencias} onCambia=${(l) => set({ agencias: l })} cat=${cat} /></div>
    ${me.permisos.asignar && html`<div style="margin-top:12px"><div class="small muted" style="margin-bottom:4px">Who does what (each person gets an alert to estimate their line)</div>
      <${LineasDemanda} v=${v} set=${set} cat=${cat} me=${me} nueva /></div>`}
    <p class="small muted">People to inform, other contacts and attachments are added once it is created.</p>
    <div class="row acciones-modal"><span class="spacer"></span><button type="button" onClick=${onClose}>Cancel</button><button class="primary" type="submit" disabled=${busy || !v.titulo.trim()}>${busy ? 'Creating…' : 'Create request'}</button></div>
  </form></div>`;
}

function AsistenteIA({ onRelleno, abierto }) {
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState('');
  const [ia, setIa] = useState(null);
  const [grabando, setGrabando] = useState(null);
  const rec = useRef(null);
  useEffect(() => { api('ia/estado').then(setIa).catch(() => setIa({ texto: false, audio: false })); }, []);
  useEffect(() => () => { try { rec.current?.stop(); } catch {} }, []);
  const dict = useDictado((t) => setTexto((x) => `${x}${x && !/\s$/.test(x) ? ' ' : ''}${t}`));
  async function transcribe(blob) {
    if (blob.size > 25 * 1024 * 1024) return toast('Audio too long: keep it under 25 MB (about 25 minutes)', true);
    setBusy('audio');
    try { const r = await api('ia/transcribir', { method: 'POST', body: { audio: await leeBase64(blob) } }); setTexto((x) => [x, r.texto].filter(Boolean).join('\n\n')); toast('Audio transcribed: check it and press «Fill in with AI»'); }
    catch (x) { toast(x.message, true); }
    setBusy('');
  }
  async function graba() {
    if (grabando) { rec.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const trozos = [];
      mr.ondataavailable = (e) => trozos.push(e.data);
      mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); setGrabando(null); transcribe(new Blob(trozos, { type: mr.mimeType || 'audio/webm' })); };
      rec.current = mr; mr.start(); setGrabando(Date.now());
    } catch { toast('Microphone access was blocked: allow it in the browser and try again', true); }
  }
  async function rellenar() {
    setBusy('ia');
    try { onRelleno(await api('ia/demanda', { method: 'POST', body: { texto } })); toast('Filled in by the AI: review it before creating'); }
    catch (x) { toast(x.message, true); }
    setBusy('');
  }
  return html`<details class="asistente" open=${abierto !== false}>
    <summary>✦ Create it from audio or notes <span class="small muted">record a voice note, upload an audio, dictate or paste an email</span></summary>
    ${ia && !ia.activa && html`<p class="small aviso-ia">The admin has switched the AI assistant off. Fill in the form by hand.</p>`}
    ${ia && ia.activa && !ia.texto && html`<p class="small aviso-ia">The AI is not available right now. Fill in the form by hand.</p>`}
    ${ia?.texto && html`<p class="small muted">${ia.proveedor === 'cloudflare' ? 'Free AI from Cloudflare (open model; your data is not used for training).' : 'AI: Claude Haiku.'}${ia.quedan != null ? ` ${ia.quedan} AI uses left today.` : ''}</p>`}
    <textarea rows="4" value=${texto} onInput=${(e) => setTexto(e.target.value)} aria-label="Text for the AI"
      placeholder="e.g. «Juan from BBVA Holding wants a PoC of the test data agency for GSD, start in January, about 30 days, Playwright and GenAI. Inform Sergio.»"></textarea>
    ${dict.provisional && html`<p class="small muted">… ${dict.provisional}</p>`}
    ${dict.error && html`<p class="small bad-t">${dict.error}</p>`}
    <div class="row" style="gap:6px;flex-wrap:wrap">
      ${typeof MediaRecorder !== 'undefined' && html`<button type="button" class=${grabando ? 'grabando' : ''} disabled=${busy || (ia && !ia.audio)} onClick=${graba}>${grabando ? '■ Stop and transcribe' : html`${ICONOS.mic} Record`}</button>`}
      <label class=${`btn${ia && !ia.audio ? ' disabled' : ''}`} title="Upload a voice note or a meeting recording (mp3, m4a, wav, webm…; up to 25 MB)">
        ${busy === 'audio' ? 'Transcribing…' : '⬆ Upload audio'}<input type="file" accept="audio/*,video/mp4,video/webm" hidden disabled=${busy || (ia && !ia.audio)} onChange=${(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) transcribe(f); }} /></label>
      ${vozSoportada && html`<button type="button" onClick=${() => (dict.escuchando ? dict.parar() : dict.iniciar('es-ES'))}>${dict.escuchando ? '■ Stop dictating' : 'Dictate'}</button>`}
      <span class="spacer"></span>
      <button type="button" class="primary" disabled=${!!busy || texto.trim().length < 20 || (ia && !ia.texto)} onClick=${rellenar}>${busy === 'ia' ? 'Thinking…' : '✦ Fill in with AI'}</button>
    </div>
  </details>`;
}

// ---------- Inicio ----------
export function Inicio({ me, cat, recargaCat }) {
  const { data } = useDemandas(false);
  const ev = useAsync(() => api('eventos'), []);
  const av = useAsync(() => api('avisos'), []);
  const [nueva, setNueva] = useState(null);
  const nombre = me.nombre || me.usuario || me.email.split('@')[0];
  const hoy = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const l = data || [];
  const vivas = l.filter((d) => d.estado !== 'done');
  const h = hoyISO();
  const en30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const acaban = vivas.filter((d) => d.fecha_fin && d.fecha_fin <= en30).sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin));
  const nuevas = l.filter((d) => d.estado === 'new');
  const porEstimar = l.filter((d) => d.estado === 'assigned');
  const curso = l.filter((d) => d.estado === 'progress');
  const coste = curso.reduce((s, d) => s + (d.coste?.total || 0), 0);
  const mes = [new Date(new Date().getFullYear(), new Date().getMonth(), 1)];
  const per = cat.personas.filter((p) => p.activo);
  const { out } = cargaPersonas(l, per, mes);
  const cap = per.reduce((s, p) => s + (p.capacidad || 0), 0);
  const carga = cap ? Math.round(per.reduce((s, p) => s + out[p.id][0].pct, 0) / cap * 100) : null;
  const pend = av.data?.pendientes || [];
  const kpis = [
    ['Open requests', vivas.length, `${l.filter((d) => d.estado !== 'done' && d.tipo === 'poc').length} PoCs`, '#/demandas'],
    ['New to assign', nuevas.length, me.permisos.asignar ? 'waiting for you to assign' : 'not assigned yet', '#/kanban', nuevas.length ? 'warn' : ''],
    ['To estimate', porEstimar.length, pend.length ? `${pend.length} lines are yours` : 'assigned, pending estimate', '#/kanban', pend.length ? 'warn' : ''],
    ['In progress', curso.length, me.permisos.costes && coste ? `${eur(coste)} estimated cost` : 'being built', '#/gantt', 'ok'],
    ['Ending in 30 days', acaban.length, acaban.some((d) => d.fecha_fin < h) ? 'some are overdue' : 'by end date', '#/gantt', acaban.some((d) => d.fecha_fin < h) ? 'bad' : ''],
    ...(carga != null ? [['Team load this month', `${carga}%`, `${per.length} people`, '#/capacidad', carga > 100 ? 'bad' : carga > 85 ? 'warn' : 'ok']] : []),
  ];
  const lista1 = me.permisos.asignar ? nuevas : [];
  return html`
    <section class="home-hero" aria-labelledby="h-home">
      <div class="hero-fondo" aria-hidden="true"><i class="orbe o1"></i><i class="orbe o2"></i><i class="orbe o3"></i><i class="rejilla"></i><i class="barrido"></i></div>
      <div class="hero-txt">
        <p class="hero-fecha">${hoy}</p>
        <h1 id="h-home">Hello, <span class="grad">${nombre}</span></h1>
        <p class="hero-sub">${!data ? 'Reading the innovation pipeline…' : `${vivas.length} open requests: ${curso.length} in progress, ${porEstimar.length} to estimate and ${nuevas.length} new.${pend.length ? ` You have ${pend.length} lines to estimate.` : ''}`}</p>
        <div class="row hero-acc">
          <button class="primary" onClick=${() => setNueva('form')}>+ New request</button>
          <button onClick=${() => setNueva('audio')}>${ICONOS.mic} From audio</button>
          <a class="btn" href="#/gantt">Gantt</a><a class="btn" href="#/kanban">Kanban</a>
        </div>
      </div>
    </section>
    <ul class="kpis">${kpis.map(([t, n, s, href, c], i) => html`<li class=${`kpi ${c || ''}`} style=${`--i:${i}`}><a href=${href}><span class="kpi-n">${n}</span><span class="kpi-t">${t}</span><span class="kpi-s">${s}</span></a></li>`)}</ul>
    <div class="home-cols">
      <section class="panel home-panel"><h2>${ICONOS.campana} For you</h2>
        <ul class="acciones">
          ${pend.map((p, i) => html`<li style=${`--i:${i}`}><span class="badge warn">Estimate</span><a href=${`#/demanda/${p.demanda_id}`}>${p.titulo}</a><span class="small muted">${p.agencia_id ? cat.agencias.find((a) => a.id === p.agencia_id)?.nombre || '' : p.funcion || ''}</span></li>`)}
          ${lista1.slice(0, 6).map((d, i) => html`<li style=${`--i:${i + pend.length}`}><span class="badge">Assign</span><a href=${`#/demanda/${d.id}`}>${d.titulo}</a><span class="small muted">${d.cliente || ''}</span></li>`)}
          ${(av.data?.avisos || []).filter((a) => !a.leido).slice(0, 6).map((a, i) => html`<li style=${`--i:${i}`}><span class="badge gris">${fecha(a.fecha)}</span><a href=${`#/demanda/${a.demanda_id}`}>${a.texto}</a></li>`)}
          ${!pend.length && !lista1.length && !(av.data?.avisos || []).some((a) => !a.leido) && html`<li class="small muted">Nothing pending for you.</li>`}</ul>
        ${(av.data?.sin_leer || 0) > 0 && html`<button class="link small" onClick=${async () => { await api('avisos/leer', { method: 'POST' }); av.reload(); window.dispatchEvent(new Event('nicole-avisos')); }}>Mark alerts as read</button>`}</section>
      <section class="panel home-panel"><h2>Ending soon</h2>
        <ul class="acciones">${acaban.slice(0, 8).map((d, i) => html`<li style=${`--i:${i}`}><span class=${`small ${d.fecha_fin < h ? 'bad-t' : 'muted'}`}>${fecha(d.fecha_fin)}</span><a href=${`#/demanda/${d.id}`}>${d.titulo}</a><span class="small muted">${estadoNombre(d.estado)}</span></li>`)}
          ${!acaban.length && html`<li class="small muted">Nothing ends in the next 30 days.</li>`}</ul></section>
      <section class="panel home-panel"><h2>Latest activity</h2>
        <ul class="actividad">${(ev.data || []).slice(0, 10).map((e, i) => html`<li style=${`--i:${i}`}><i class="punto"></i><span>${e.entidad === 'demanda' ? html`<a href=${`#/demanda/${e.entidad_id}`}>#${e.entidad_id}</a> ` : ''}${e.detalle || e.accion}</span><span class="spacer"></span><time class="small muted">${e.quien} · ${fecha(e.fecha)}</time></li>`)}
          ${ev.data && !ev.data.length && html`<li class="small muted">No activity yet.</li>`}</ul></section>
    </div>
    ${nueva && html`<${NuevaDemanda} me=${me} cat=${cat} recargaCat=${recargaCat} deAudio=${nueva === 'audio'} onClose=${() => setNueva(null)} onCreada=${(id) => { setNueva(null); ir(`#/demanda/${id}`); }} />`}`;
}

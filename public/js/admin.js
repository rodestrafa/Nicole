// Nicole: listas (maestros), usuarios, ajustes, historial y ayuda.
import { html, useState } from '/vendor/preact-htm.js';
import { api, toast, useAsync, fecha, fechaHora, eur, ROLES, rolNombre, MADUREZ, BadgeMadurez, PRIO_EN } from './util.js';
import { AltaRapida } from './demandas.js';

const sinT = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// ---------- Listas ----------
const PESTANAS = [['clientes', 'Clients and projects'], ['agencias', 'Agencies'], ['contactos', 'Managers and contacts'], ['personas', 'Team']];
export function Maestros({ tab, me, cat, recargaCat }) {
  return html`<h1>Lists</h1>
    <div class="seg" role="tablist" style="margin-bottom:12px">${PESTANAS.map(([k, n]) => html`<a role="tab" class="btn" aria-selected=${tab === k} aria-pressed=${tab === k} href=${`#/maestros/${k}`}>${n}</a>`)}</div>
    ${tab === 'clientes' && html`<${Clientes} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
    ${tab === 'agencias' && html`<${Agencias} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
    ${tab === 'contactos' && html`<${Contactos} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
    ${tab === 'personas' && html`<${Personas} me=${me} cat=${cat} recargaCat=${recargaCat} />`}`;
}

async function guarda(res, id, body, recargaCat, ok = 'Saved') {
  try { await api(id ? `${res}/${encodeURIComponent(id)}` : res, { method: id ? 'PUT' : 'POST', body }); toast(ok); await recargaCat(); return true; }
  catch (x) { toast(x.message, true); return false; }
}

function Clientes({ me, cat, recargaCat }) {
  const [q, setQ] = useState('');
  const [sector, setSector] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [alta, setAlta] = useState(null);
  const puede = me.permisos.maestros;
  const l = cat.clientes.filter((c) => (!sector || c.sector === sector) && (!q || sinT(`${c.nombre} ${c.codigo} ${c.client_family} ${c.pais}`).includes(sinT(q))));
  return html`
    <div class="row filtros"><input placeholder="Search client, code, family…" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search clients" />
      <select value=${sector} onChange=${(e) => setSector(e.target.value)} aria-label="Sector"><option value="">All sectors</option>${cat.sectores.map((s) => html`<option value=${s}>${s}</option>`)}</select>
      <span class="spacer"></span>${puede && html`<button class="primary" onClick=${() => setAlta({ tipo: 'cliente' })}>+ New client</button>`}</div>
    <p class="small muted">${l.length} clients · loaded from the QS Budget FY27 (Spain and Benelux) plus the ones created here. Click a client to see and add its projects.</p>
    <div class="panel tabla-scroll" style="padding:0"><table class="t">
      <thead><tr><th>Client / account</th><th>Code</th><th>Client family</th><th>Sector</th><th>Country</th><th>Projects</th><th>Active</th></tr></thead>
      <tbody>${l.map((c) => { const ps = cat.proyectos.filter((p) => p.cliente_id === c.id); return html`
        <tr class="click" onClick=${() => setAbierto(abierto === c.id ? null : c.id)}><td><b>${c.nombre}</b>${c.origen === 'app' ? html` <span class="badge gris">new</span>` : ''}</td><td class="small">${c.codigo || '—'}</td>
          <td class="small">${c.client_family || '—'}</td><td class="small">${c.sector || '—'}</td><td class="small">${c.pais || '—'}</td><td class="small">${ps.length || '—'}</td>
          <td><input type="checkbox" checked=${!!c.activo} disabled=${!puede} aria-label=${`${c.nombre} active`} onClick=${(e) => e.stopPropagation()} onChange=${(e) => guarda('clientes', c.id, { activo: e.target.checked ? 1 : 0 }, recargaCat)} /></td></tr>
        ${abierto === c.id && html`<tr class="detalle"><td colspan="7"><div class="stack">
          ${ps.map((p) => html`<div class="row"><b>${p.nombre}</b><span class="small muted">${[p.codigo, p.cuenta_cargo && `charge account ${p.cuenta_cargo}`].filter(Boolean).join(' · ')}</span>
            ${puede && html`<label class="chk small"><input type="checkbox" checked=${!!p.activo} onChange=${(e) => guarda('proyectos', p.id, { activo: e.target.checked ? 1 : 0 }, recargaCat)} /> active</label>`}</div>`)}
          ${!ps.length && html`<span class="small muted">No projects yet.</span>`}
          ${puede && html`<div><button class="link" onClick=${() => setAlta({ tipo: 'proyecto', cliente: c })}>+ New project in ${c.nombre}</button></div>`}</div></td></tr>`}`; })}
      ${!l.length && html`<tr><td colspan="7" class="muted">No clients match.</td></tr>`}</tbody></table></div>
    ${alta && html`<${AltaRapida} tipo=${alta.tipo} cliente=${alta.cliente} sector=${sector} cat=${cat} onClose=${() => setAlta(null)} onCreado=${async () => { setAlta(null); await recargaCat(); }} />`}`;
}

function Agencias({ me, cat, recargaCat }) {
  const [edit, setEdit] = useState(null);
  const admin = me.admin;
  const dominios = [...new Set(cat.agencias.map((a) => a.dominio).filter(Boolean))];
  async function guardar(e) {
    e.preventDefault();
    const { id, nuevo, ...body } = edit;
    if (await guarda('agencias', nuevo ? null : id, nuevo ? { ...body, id: body.nombre } : body, recargaCat)) setEdit(null);
  }
  return html`
    <div class="row"><p class="small muted" style="flex:1">The AI agencies of the QS AI Offering (draft v0.6, 23/10/2026). Each request picks the agencies it implements or shows.</p>
      ${admin && html`<button class="primary" onClick=${() => setEdit({ nuevo: true, nombre: '', dominio: dominios[0] || '', madurez: 'concepto', resumen: '', activo: 1 })}>+ New agency</button>`}</div>
    ${dominios.map((d) => html`<section class="panel"><h2>${d}</h2><div class="tabla-scroll"><table class="t">
      <thead><tr><th>Agency</th><th>Maturity</th><th>Summary</th><th>Active</th>${admin && html`<th></th>`}</tr></thead>
      <tbody>${cat.agencias.filter((a) => a.dominio === d).map((a) => html`<tr><td><b>${a.nombre}</b></td><td><${BadgeMadurez} m=${a.madurez} /></td><td class="small">${a.resumen}</td>
        <td>${a.activo ? 'Yes' : 'No'}</td>${admin && html`<td><button class="ghost" onClick=${() => setEdit({ ...a })}>Edit</button></td>`}</tr>`)}</tbody></table></div></section>`)}
    ${edit && html`<div class="modal-bg" onClick=${() => setEdit(null)}><form class="modal" role="dialog" aria-modal="true" aria-label="Agency" onClick=${(e) => e.stopPropagation()} onSubmit=${guardar}>
      <h2>${edit.nuevo ? 'New agency' : edit.nombre}</h2>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <label class="f req wide"><span>Name</span><input required value=${edit.nombre} onInput=${(e) => setEdit({ ...edit, nombre: e.target.value })} /></label>
        <label class="f"><span>Domain</span><input list="l-dom" value=${edit.dominio || ''} onInput=${(e) => setEdit({ ...edit, dominio: e.target.value })} /><datalist id="l-dom">${dominios.map((x) => html`<option value=${x} />`)}</datalist></label>
        <label class="f"><span>Maturity</span><select value=${edit.madurez || ''} onChange=${(e) => setEdit({ ...edit, madurez: e.target.value })}>${MADUREZ.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
        <label class="f wide"><span>Summary</span><textarea rows="3" value=${edit.resumen || ''} onInput=${(e) => setEdit({ ...edit, resumen: e.target.value })}></textarea></label>
        <label class="chk"><input type="checkbox" checked=${!!edit.activo} onChange=${(e) => setEdit({ ...edit, activo: e.target.checked ? 1 : 0 })} /> Active</label>
      </div>
      <div class="row acciones-modal"><span class="spacer"></span><button type="button" onClick=${() => setEdit(null)}>Cancel</button><button class="primary" type="submit">Save</button></div>
    </form></div>`}`;
}

function Contactos({ me, cat, recargaCat }) {
  const [q, setQ] = useState('');
  const [alta, setAlta] = useState(null);
  const puede = me.permisos.maestros;
  const l = cat.contactos.filter((c) => !q || sinT(`${c.nombre} ${c.email} ${c.area}`).includes(sinT(q)));
  return html`
    <div class="row filtros"><input placeholder="Search name, email, area…" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search contacts" /><span class="spacer"></span>
      ${puede && html`<button onClick=${() => setAlta('contacto')}>+ New contact</button><button class="primary" onClick=${() => setAlta('manager')}>+ New manager</button>`}</div>
    <p class="small muted">Managers appear in «Responsible manager». Contacts (sector, AS, client…) can be added to a request as people to inform or other contacts.</p>
    <div class="panel tabla-scroll" style="padding:0"><table class="t">
      <thead><tr><th>Name</th><th>Email</th><th>Area</th><th>Responsible manager</th><th>Active</th></tr></thead>
      <tbody>${l.map((c) => html`<tr><td><b>${c.nombre}</b></td><td class="small">${c.email || '—'}</td>
        <td><select value=${c.area || ''} disabled=${!puede} aria-label="Area" onChange=${(e) => guarda('contactos', c.id, { area: e.target.value }, recargaCat)}>${cat.areas_contacto.map((a) => html`<option value=${a}>${a}</option>`)}</select></td>
        <td><input type="checkbox" checked=${!!c.es_manager} disabled=${!puede} aria-label=${`${c.nombre} is a manager`} onChange=${(e) => guarda('contactos', c.id, { es_manager: e.target.checked ? 1 : 0 }, recargaCat)} /></td>
        <td><input type="checkbox" checked=${!!c.activo} disabled=${!puede} aria-label=${`${c.nombre} active`} onChange=${(e) => guarda('contactos', c.id, { activo: e.target.checked ? 1 : 0 }, recargaCat)} /></td></tr>`)}
      ${!l.length && html`<tr><td colspan="5" class="muted">No contacts yet. The list of managers is pending.</td></tr>`}</tbody></table></div>
    ${alta && html`<${AltaRapida} tipo=${alta} cat=${cat} onClose=${() => setAlta(null)} onCreado=${async () => { setAlta(null); await recargaCat(); }} />`}`;
}

function Personas({ me, cat, recargaCat }) {
  const [edit, setEdit] = useState(null);
  const admin = me.admin;
  const usuarios = useAsync(() => (admin ? api('personas-app') : Promise.resolve([])), [admin]);
  async function guardar(e) {
    e.preventDefault();
    const { id, nuevo, ...body } = edit;
    for (const k of ['tarifa_dia', 'capacidad']) body[k] = body[k] === '' || body[k] == null ? null : Number(body[k]);
    if (await guarda('personas', nuevo ? null : id, body, recargaCat)) setEdit(null);
  }
  return html`
    <div class="row"><p class="small muted" style="flex:1">The innovation team: who can be assigned to a line. Link each person to their user email so they get alerts and can estimate their lines.
      ${admin ? ' Rates are only visible to the admin; empty = the rate of their role (Settings).' : ''}</p>
      ${admin && html`<button class="primary" onClick=${() => setEdit({ nuevo: true, nombre: '', email: '', rol: 'architect', funcion: '', tarifa_dia: '', capacidad: 100, activo: 1 })}>+ New person</button>`}</div>
    <div class="panel tabla-scroll" style="padding:0"><table class="t">
      <thead><tr><th>Person</th><th>Role</th><th>Function</th><th>User email</th>${admin && html`<th>Rate / day</th>`}<th>Capacity</th><th>Active</th>${admin && html`<th></th>`}</tr></thead>
      <tbody>${cat.personas.map((p) => html`<tr><td><b>${p.nombre}</b></td><td class="small">${rolNombre(p.rol)}</td><td class="small">${p.funcion || '—'}</td>
        <td class="small">${p.email || html`<span class="badge warn">not linked</span>`}</td>${admin && html`<td class="small">${p.tarifa_dia ? eur(p.tarifa_dia) : 'role rate'}</td>`}
        <td class="small">${p.capacidad}%</td><td>${p.activo ? 'Yes' : 'No'}</td>${admin && html`<td><button class="ghost" onClick=${() => setEdit({ ...p, tarifa_dia: p.tarifa_dia ?? '' })}>Edit</button></td>`}</tr>`)}
      ${!cat.personas.length && html`<tr><td colspan="8" class="muted">No people yet.</td></tr>`}</tbody></table></div>
    ${edit && html`<div class="modal-bg" onClick=${() => setEdit(null)}><form class="modal" role="dialog" aria-modal="true" aria-label="Person" onClick=${(e) => e.stopPropagation()} onSubmit=${guardar}>
      <h2>${edit.nuevo ? 'New person' : edit.nombre}</h2>
      <div class="grid" style="grid-template-columns:1fr 1fr">
        <label class="f req wide"><span>Name</span><input required value=${edit.nombre} onInput=${(e) => setEdit({ ...edit, nombre: e.target.value })} /></label>
        <label class="f"><span>Role</span><select value=${edit.rol || ''} onChange=${(e) => setEdit({ ...edit, rol: e.target.value })}>${ROLES.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
        <label class="f"><span>Function</span><input value=${edit.funcion || ''} onInput=${(e) => setEdit({ ...edit, funcion: e.target.value })} placeholder="e.g. CoE lead" /></label>
        <label class="f wide"><span>User email (for alerts and «my lines»)</span><input type="email" list="l-usuarios" value=${edit.email || ''} onInput=${(e) => setEdit({ ...edit, email: e.target.value })} />
          <datalist id="l-usuarios">${(usuarios.data || []).map((u) => html`<option value=${u.email}>${u.nombre || u.usuario || ''}</option>`)}</datalist></label>
        <label class="f"><span>Rate (€/day)</span><input type="number" min="0" value=${edit.tarifa_dia} onInput=${(e) => setEdit({ ...edit, tarifa_dia: e.target.value })} placeholder="role rate" /></label>
        <label class="f"><span>Capacity for innovation (%)</span><input type="number" min="0" max="100" value=${edit.capacidad} onInput=${(e) => setEdit({ ...edit, capacidad: e.target.value })} /></label>
        <label class="chk"><input type="checkbox" checked=${!!edit.activo} onChange=${(e) => setEdit({ ...edit, activo: e.target.checked ? 1 : 0 })} /> Active</label>
      </div>
      <div class="row acciones-modal"><span class="spacer"></span><button type="button" onClick=${() => setEdit(null)}>Cancel</button><button class="primary" type="submit">Save</button></div>
    </form></div>`}`;
}

// ---------- Usuarios ----------
export function Usuarios({ me, onInvitar }) {
  const { data, reload } = useAsync(() => api('usuarios'), []);
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState('architect');
  async function alta(e) {
    e.preventDefault();
    try { await api('usuarios', { method: 'POST', body: { email, rol } }); setEmail(''); reload(); toast(`Access granted. Sign in with ${email} and the password 1111`); } catch (er) { toast(er.message, true); }
  }
  async function cambiaRol(u, r) { try { await api(`usuarios/${encodeURIComponent(u.email)}`, { method: 'PUT', body: { rol: r } }); reload(); toast(`${u.usuario || u.email}: ${rolNombre(r)}`); } catch (er) { toast(er.message, true); } }
  async function reset(u) { if (!confirm(`Reset the password of ${u.email} to 1111?`)) return; await api(`usuarios/${encodeURIComponent(u.email)}/reset`, { method: 'POST' }); reload(); toast('Reset to 1111'); }
  async function baja(u) { if (!confirm(`Remove access for ${u.email}?`)) return; try { await api(`usuarios/${encodeURIComponent(u.email)}`, { method: 'DELETE' }); reload(); } catch (er) { toast(er.message, true); } }
  return html`<div class="row"><h1 style="flex:1">Users</h1><button onClick=${onInvitar}>Invite with a link</button></div>
    <form class="panel row" onSubmit=${alta}>
      <input style="max-width:320px" type="email" placeholder="email@nttdata.com" value=${email} onInput=${(e) => setEmail(e.target.value)} aria-label="Email" />
      <select style="width:auto" value=${rol} onChange=${(e) => setRol(e.target.value)} aria-label="Role">${ROLES.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select>
      <button class="primary" type="submit" disabled=${!email}>Grant access</button>
      <span class="small muted">They sign in with their email and the password 1111 and choose their own on first sign-in. Remember to link them to their person in Lists › Team.</span>
    </form>
    <div class="panel tabla-scroll" style="padding:0"><table class="t"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Last sign-in</th><th></th></tr></thead>
      <tbody>${(data || []).map((u) => html`<tr><td>${u.email}</td><td>${u.nombre || u.usuario || html`<span class="muted">pending</span>`}${u.debe_cambiar ? html` <span class="badge warn">initial password</span>` : ''}</td>
        <td><select value=${u.rol} aria-label=${`Role of ${u.email}`} onChange=${(e) => cambiaRol(u, e.target.value)}>${ROLES.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></td>
        <td class="small">${u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : '—'}</td>
        <td class="row"><button onClick=${() => reset(u)}>Reset to 1111</button>${u.email !== me.email && html`<button class="danger" onClick=${() => baja(u)}>Remove access</button>`}</td></tr>`)}</tbody></table></div>`;
}

// ---------- Ajustes ----------
const CAMPOS_REGLA = [['family', 'Client family contains'], ['cliente', 'Client name contains'], ['sector', 'Sector is'], ['pais', 'Country is'], ['fuera_espana', 'Any country outside Spain']];
export function Ajustes({ cat, recargaCat }) {
  const { data, reload } = useAsync(() => api('ajustes'), []);
  const [v, setV] = useState(null);
  const [token, setToken] = useState(null);
  if (data && !v) setV(data);
  if (!v) return html`<p class="cargando">Loading…</p>`;
  const set = (o) => setV({ ...v, ...o });
  async function guardar() {
    try { await api('ajustes', { method: 'PUT', body: v }); toast('Settings saved'); await reload(); await recargaCat(); } catch (x) { toast(x.message, true); }
  }
  const reglas = v.reglas_prioridad || [];
  const setRegla = (i, o) => set({ reglas_prioridad: reglas.map((r, j) => (j === i ? { ...r, ...o } : r)) });
  const mueve = (i, d) => { const l = [...reglas]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); set({ reglas_prioridad: l }); };
  async function nuevoToken() {
    if (data.api_token && !confirm('Create a new API key? The current one stops working.')) return;
    try { const r = await api('token', { method: 'POST' }); setToken(r.token); reload(); } catch (x) { toast(x.message, true); }
  }
  async function revocar() { if (!confirm('Revoke the API key?')) return; await api('token', { method: 'DELETE' }); setToken(null); reload(); toast('API key revoked'); }
  return html`<div class="row"><h1 style="flex:1">Settings</h1><button class="primary" onClick=${guardar}>Save settings</button></div>
    <section class="panel"><h2>Rates by role (€/day)</h2>
      <p class="small muted">Used to calculate the cost of each line when the person has no rate of their own. Only the admin sees rates.</p>
      <div class="grid">${ROLES.map(([k, n]) => html`<label class="f"><span>${n}</span><input type="number" min="0" value=${v[`tarifa_${k}`] || ''} onInput=${(e) => set({ [`tarifa_${k}`]: Number(e.target.value) || 0 })} /></label>`)}</div></section>
    <section class="panel"><h2>Priority rules by client</h2>
      <p class="small muted">When a request is created, its priority is suggested from its client and country. The first rule that matches wins; requests that match none get Medium. Directors can always change it by hand.</p>
      <div class="tabla-scroll"><table class="t"><thead><tr><th>#</th><th>When</th><th>Text</th><th>Priority</th><th></th></tr></thead>
        <tbody>${reglas.map((r, i) => html`<tr><td class="small">${i + 1}</td>
          <td><select value=${r.campo} aria-label="Rule field" onChange=${(e) => setRegla(i, { campo: e.target.value })}>${CAMPOS_REGLA.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></td>
          <td>${r.campo === 'fuera_espana' ? html`<span class="small muted">—</span>` : r.campo === 'sector' ? html`<select value=${r.texto} aria-label="Sector" onChange=${(e) => setRegla(i, { texto: e.target.value })}>${cat.sectores.map((s) => html`<option value=${s}>${s}</option>`)}</select>`
            : r.campo === 'pais' ? html`<select value=${r.texto} aria-label="Country" onChange=${(e) => setRegla(i, { texto: e.target.value })}>${cat.paises.map((s) => html`<option value=${s}>${s}</option>`)}</select>`
            : html`<input value=${r.texto} aria-label="Text" onInput=${(e) => setRegla(i, { texto: e.target.value })} />`}</td>
          <td><select value=${r.prioridad} aria-label="Priority" onChange=${(e) => setRegla(i, { prioridad: e.target.value })}>${cat.prioridades.map((p) => html`<option value=${p}>${PRIO_EN[p]}</option>`)}</select></td>
          <td class="row" style="gap:2px"><button class="ghost" disabled=${i === 0} aria-label="Move up" onClick=${() => mueve(i, -1)}>↑</button><button class="ghost" disabled=${i === reglas.length - 1} aria-label="Move down" onClick=${() => mueve(i, 1)}>↓</button>
            <button class="ghost" aria-label="Remove rule" onClick=${() => set({ reglas_prioridad: reglas.filter((_, j) => j !== i) })}>×</button></td></tr>`)}</tbody></table></div>
      <button class="link" onClick=${() => set({ reglas_prioridad: [...reglas, { campo: 'family', texto: '', prioridad: 'Alta' }] })}>+ Add a rule</button></section>
    <section class="panel"><h2>AI assistant</h2>
      <p class="small muted">${data.ia === 'claude' ? 'Using Claude Haiku (API key set in Cloudflare).' : data.ia === 'cloudflare' ? 'Using the free AI of Cloudflare (Workers AI).' : 'AI is not available: the Workers AI binding is missing.'}</p>
      <div class="grid"><label class="chk"><input type="checkbox" checked=${!!v.ia_activa} onChange=${(e) => set({ ia_activa: e.target.checked ? 1 : 0 })} /> AI assistant on</label>
        <label class="f"><span>Uses per person and day</span><input type="number" min="0" value=${v.ia_usuario_dia} onInput=${(e) => set({ ia_usuario_dia: Number(e.target.value) || 0 })} /></label>
        <label class="f"><span>Uses per month (whole team)</span><input type="number" min="0" value=${v.ia_total_mes} onInput=${(e) => set({ ia_total_mes: Number(e.target.value) || 0 })} /></label></div></section>
    <section class="panel"><h2>API key for Claude</h2>
      <p class="small muted">Lets Claude register requests for you from a conversation (it acts with the Director role). Send header <code>Authorization: Bearer &lt;key&gt;</code> to <code>/api/demandas</code>. The key is shown only once.</p>
      <p>${data.api_token ? html`<span class="badge ok">Active</span>` : html`<span class="badge gris">No key</span>`}</p>
      ${token && html`<input class="link" readonly value=${token} onFocus=${(e) => e.target.select()} aria-label="API key" /><p class="small warn-t">Copy it now: it will not be shown again.</p>`}
      <div class="row"><button onClick=${nuevoToken}>${data.api_token ? 'Create a new key' : 'Create key'}</button>${data.api_token && html`<button class="danger" onClick=${revocar}>Revoke</button>`}</div></section>
    <section class="panel"><h2>Storage and backup</h2>
      <p class="small">Attachments: ${data.r2 ? html`<span class="badge ok">R2 connected</span> up to 25 MB per file` : html`<span class="badge warn">R2 not connected</span> files up to 1.5 MB are kept in the database`}</p>
      <a class="btn" href="/api/backup" download>Download a backup (JSON)</a></section>`;
}

// ---------- Historial ----------
export function Historial() {
  const { data, error } = useAsync(() => api('eventos'), []);
  const [q, setQ] = useState('');
  if (error) return html`<div class="panel">Error: ${error.message}</div>`;
  const l = (data || []).filter((e) => !q || sinT(`${e.detalle} ${e.accion} ${e.quien} ${e.entidad} ${e.entidad_id}`).includes(sinT(q)));
  return html`<h1>History</h1>
    <div class="filtros"><input placeholder="Search…" value=${q} onInput=${(e) => setQ(e.target.value)} aria-label="Search history" /></div>
    <div class="panel tabla-scroll" style="padding:0"><table class="t"><thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
      <tbody>${l.map((e) => html`<tr><td class="small">${fechaHora(e.fecha)}</td><td class="small">${e.quien}</td>
        <td class="small">${e.entidad === 'demanda' ? html`<a href=${`#/demanda/${e.entidad_id}`}>Request #${e.entidad_id}</a>` : `${e.entidad} ${e.entidad_id}`} · ${e.accion}</td><td class="small">${e.detalle || ''}</td></tr>`)}
      ${data && !l.length && html`<tr><td colspan="4" class="muted">Nothing yet.</td></tr>`}</tbody></table></div>`;
}

// ---------- Ayuda ----------
export function Ayuda({ me }) {
  return html`<h1>Help</h1>
    <section class="panel"><h2>What Nicole is for</h2>
      <p>Nicole keeps the requests that reach the innovation team in one place: PoCs of an agency, implementations, research, demos, agency showcases, improvements, support to a team, trainings, adoption advisory, talks and the newsletter.
      Each request has a client, a priority and one line per agency or piece of work, with the person who does it and their estimate.</p></section>
    <section class="panel"><h2>The flow</h2><ol>
      <li><b>New.</b> Someone (usually the director) registers the request: by hand, from a voice note or notes with the AI, or by asking Claude. The priority is suggested from the client rules.</li>
      <li><b>Assigned · to estimate.</b> The director adds a line per agency or piece of work and chooses who does it. Each person gets an alert on their Home.</li>
      <li><b>Planned.</b> When every line has days, the request moves to Planned on its own. Lines can have their own dates; otherwise they use the request dates.</li>
      <li><b>In progress</b> and <b>Done.</b> The people assigned move the request as it goes. Discarded requests are archived.</li></ol></section>
    <section class="panel"><h2>Who can do what</h2>
      <table class="t"><thead><tr><th>Action</th><th>Who</th></tr></thead><tbody>
        <tr><td>Create requests, attach files</td><td>Everyone</td></tr>
        <tr><td>Assign people (lines) and edit any estimate</td><td>Admin, Principal Director, Director, PM</td></tr>
        <tr><td>Estimate your own line, move the status of your requests</td><td>Each person assigned</td></tr>
        <tr><td>Edit any request</td><td>Admin, directors, architects, PM</td></tr>
        <tr><td>Change the priority, discard or archive</td><td>Admin, Principal Director, Director</td></tr>
        <tr><td>See costs</td><td>Admin, directors, PM</td></tr>
        <tr><td>See and change rates, users, settings; delete</td><td>Admin</td></tr></tbody></table>
      <p class="small muted">You are ${rolNombre(me.rol)}.</p></section>
    <section class="panel"><h2>Views</h2>
      <p>In Requests, Kanban and Gantt, set the filters you want (for example sector Utilities, or client family BBVA) and press «Save current filters as a view». Saved views appear in the menu under «My views». The star makes a view open by default on that page.</p>
      <p>The Gantt has two modes: <b>By person</b> shows what each person has and until when they are busy, so you can see who is free for a new request; <b>By request</b> shows each request as one bar.</p></section>
    <section class="panel"><h2>Cost</h2><p>Cost of a line = days × the person's rate (or the rate of their role). The cost of a request is the sum of its lines; if it has no lines, its overall estimate × the average role rate.</p></section>`;
}

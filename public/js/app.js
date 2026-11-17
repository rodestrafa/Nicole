// Nicole: demanda de innovación. Shell de la app (login, menú, rutas), con el mismo frontal que Charlize.
import { html, render, useState, useEffect } from '/vendor/preact-htm.js';
import { api, toast, ir, ICONOS, ROLES, rolNombre } from './util.js';
import { Inicio, Lista, Kanban, Gantt, Capacidad, Demanda } from './demandas.js';
import { Maestros, Usuarios, Ajustes, Historial, Ayuda } from './admin.js';

// #/vista/a?vista=x → ['vista', 'a']
const ruta = () => { const p = location.hash.replace(/^#\/?/, '').split('?')[0].split('/'); return [p[0] || 'inicio', p[1] ? decodeURIComponent(p[1]) : null]; };

function Logo() { return html`<span class="logo-r" aria-hidden="true">N</span>`; }

function Login({ onOk, version }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  async function entrar(e) {
    e.preventDefault(); setError(null);
    try { await api('login', { method: 'POST', body: { login, password } }); onOk(); } catch (er) { setError(er.message); }
  }
  return html`<main class="auth"><form class="panel" onSubmit=${entrar}>
    <div class="marca"><${Logo} /><div><b>Nicole</b><div class="small muted">Innovation demand · first time? Use your email and the password 1111</div></div></div>
    <div class="grid" style="grid-template-columns:1fr">
      <label class="f"><span>Email or username</span><input value=${login} onInput=${(e) => setLogin(e.target.value)} autocomplete="username" autofocus /></label>
      <label class="f"><span>Password</span><input type="password" value=${password} onInput=${(e) => setPassword(e.target.value)} autocomplete="current-password" /></label>
    </div>
    ${error && html`<p class="small" style="color:var(--bad)" role="alert">${error}</p>`}
    <div class="row" style="margin-top:12px"><span class="small muted">Forgot your password? Ask the admin to reset it.</span><span class="spacer"></span><button class="primary" type="submit">Sign in</button></div>
    ${version && html`<p class="version">Version ${version}</p>`}
  </form></main>`;
}

function Unirse({ token, onOk }) {
  const [valida, setValida] = useState(null);
  const [f, setF] = useState({ email: '', usuario: '', nombre: '', password: '', rep: '' });
  const [error, setError] = useState(null);
  useEffect(() => { api(`invitacion/${encodeURIComponent(token)}`).then((r) => setValida(r.valida)).catch(() => setValida(false)); }, [token]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function crear(e) {
    e.preventDefault(); setError(null);
    if (f.password !== f.rep) return setError('Passwords do not match');
    try { await api('registro', { method: 'POST', body: { token, email: f.email, usuario: f.usuario, nombre: f.nombre, password: f.password } }); location.hash = '#/inicio'; onOk(); }
    catch (er) { setError(er.message); }
  }
  return html`<main class="auth"><form class="panel" onSubmit=${crear} aria-labelledby="t-join">
    <div class="marca"><${Logo} /><div><h1 id="t-join" class="h-marca">Join Nicole</h1><div class="small muted">Create your account with your NTT DATA email</div></div></div>
    ${valida === null && html`<p class="muted">Checking invite…</p>`}
    ${valida === false && html`<p role="alert">This invite link has expired or was already used. Ask for a new one.</p>`}
    ${valida && html`<div class="stack">
      <label class="f"><span>NTT DATA email</span><input type="email" required value=${f.email} onInput=${set('email')} autocomplete="email" placeholder="name.surname@nttdata.com" /></label>
      <label class="f"><span>Full name</span><input value=${f.nombre} onInput=${set('nombre')} autocomplete="name" /></label>
      <label class="f"><span>Username</span><input required value=${f.usuario} onInput=${set('usuario')} autocomplete="username" pattern="[A-Za-z0-9._\-]{3,30}" /></label>
      <label class="f"><span>Password (at least 4 characters)</span><input type="password" required minlength="4" value=${f.password} onInput=${set('password')} autocomplete="new-password" /></label>
      <label class="f"><span>Repeat password</span><input type="password" required value=${f.rep} onInput=${set('rep')} autocomplete="new-password" /></label>
      ${error && html`<p class="error" role="alert">${error}</p>`}
      <button class="primary full" type="submit">Create account</button>
    </div>`}
    <p class="small muted" style="margin-top:14px"><a href="#/inicio">I already have an account</a></p>
  </form></main>`;
}

export function Compartir({ onClose }) {
  const [rol, setRol] = useState('architect');
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);
  async function crear() {
    setError(null);
    try { const r = await api('invitaciones', { method: 'POST', body: { rol } }); setLink(`${location.origin}/#/join/${r.token}`); } catch (e) { setError(e.message); }
  }
  const copiar = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast('Select the link and copy it', true); } };
  return html`<div class="modal-bg" onClick=${onClose}><div class="modal estrecho" role="dialog" aria-modal="true" aria-labelledby="t-share" onClick=${(e) => e.stopPropagation()}>
    <h2 id="t-share">Invite someone</h2>
    <p class="muted">Choose their role and send them the link. They create their own username and password with their NTT DATA email. It works once and expires in 7 days. Nothing is emailed.</p>
    <div class="row"><label class="f" style="flex:1"><span>Role</span><select value=${rol} onChange=${(e) => { setRol(e.target.value); setLink(null); }}>${ROLES.map(([k, n]) => html`<option value=${k}>${n}</option>`)}</select></label>
      <button class="primary" style="align-self:flex-end" onClick=${crear}>Create link</button></div>
    ${error && html`<p class="error" role="alert">${error}</p>`}
    ${link && html`<input class="link" readonly value=${link} onFocus=${(e) => e.target.select()} aria-label="Invite link" style="margin-top:10px" />
      <div class="row acciones"><span class="spacer"></span><button class="primary" onClick=${copiar}>Copy link</button></div>`}
    <div class="row" style="margin-top:8px"><span class="spacer"></span><button class="ghost" onClick=${onClose}>Close</button></div>
  </div></div>`;
}

function CambiarPassword({ me, onOk, forzado, version }) {
  const [usuario, setUsuario] = useState(me.usuario || '');
  const [nombre, setNombre] = useState(me.nombre || '');
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [rep, setRep] = useState('');
  const [error, setError] = useState(null);
  async function guardar(e) {
    e.preventDefault(); setError(null);
    if (nueva !== rep) return setError('Passwords do not match');
    try { await api('password', { method: 'POST', body: { usuario, nombre, actual, nueva } }); toast('Saved'); onOk(); } catch (er) { setError(er.message); }
  }
  return html`<main class=${forzado ? 'auth' : ''} style=${forzado ? '' : 'max-width:460px'}><form class="panel" onSubmit=${guardar}>
    <h1 class="h-marca">${forzado ? 'First sign-in: choose your username and password' : 'My account'}</h1>
    <p class="small muted">${me.email} · ${rolNombre(me.rol)}</p>
    <div class="grid" style="grid-template-columns:1fr">
      <label class="f"><span>Full name</span><input value=${nombre} onInput=${(e) => setNombre(e.target.value)} autocomplete="name" /></label>
      <label class="f"><span>Username</span><input value=${usuario} onInput=${(e) => setUsuario(e.target.value)} placeholder="e.g. rrodriguez" autocomplete="username" /></label>
      ${!forzado && html`<label class="f"><span>Current password</span><input type="password" value=${actual} onInput=${(e) => setActual(e.target.value)} /></label>`}
      <label class="f"><span>New password (at least 4 characters)</span><input type="password" value=${nueva} onInput=${(e) => setNueva(e.target.value)} autocomplete="new-password" /></label>
      <label class="f"><span>Repeat the new password</span><input type="password" value=${rep} onInput=${(e) => setRep(e.target.value)} autocomplete="new-password" /></label>
    </div>
    ${error && html`<p class="small" style="color:var(--bad)" role="alert">${error}</p>`}
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="primary" type="submit">Save</button></div>
    ${version && html`<p class="version">Nicole · version ${version}</p>`}
  </form></main>`;
}

const TITULOS = { inicio: 'Home', demandas: 'Requests', kanban: 'Kanban', gantt: 'Gantt', capacidad: 'Capacity', demanda: 'Request', maestros: 'Lists', usuarios: 'Users',
  ajustes: 'Settings', historial: 'History', ayuda: 'Help', cuenta: 'My account' };

function App() {
  const [r, setR] = useState(ruta());
  const [me, setMe] = useState(null);
  const [cat, setCat] = useState(null);
  const [err, setErr] = useState(null);
  const [version, setVersion] = useState('');
  const [tema, setTema] = useState(document.documentElement.dataset.theme);
  const [menuCorto, setMenuCorto] = useState(() => { try { return localStorage.menuCortoNicole === '1'; } catch { return false; } });
  const [invitar, setInvitar] = useState(false);
  const [nAvisos, setNAvisos] = useState(0);
  const [, setVistasN] = useState(0);
  useEffect(() => { const h = () => setR(ruta()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => { document.title = `${TITULOS[r[0]] || 'Home'} · Nicole`; }, [r[0]]);
  useEffect(() => { try { localStorage.menuCortoNicole = menuCorto ? '1' : '0'; } catch {} }, [menuCorto]);
  useEffect(() => { api('version').then((v) => setVersion(v.version)).catch(() => {}); }, []);
  useEffect(() => { const h = () => setVistasN((n) => n + 1); addEventListener('nicole-vistas', h); return () => removeEventListener('nicole-vistas', h); }, []);
  const cuentaAvisos = () => api('avisos').then((a) => setNAvisos(a.sin_leer + a.pendientes.length)).catch(() => {});
  useEffect(() => { if (me && !me.debe_cambiar) cuentaAvisos(); }, [me, r[0]]);
  useEffect(() => { addEventListener('nicole-avisos', cuentaAvisos); return () => removeEventListener('nicole-avisos', cuentaAvisos); }, []);
  const recargaCat = () => api('catalogos').then(setCat).catch((e) => toast(e.message, true));
  window.recargaCatNicole = recargaCat;
  const cargaMe = () => api('me').then((m) => {
    setMe(m); setErr(null);
    if (!m.debe_cambiar) recargaCat();
  }).catch((e) => { setMe(null); setErr(e); });
  useEffect(() => { cargaMe(); }, []);
  const cambiaTema = () => { const t = tema === 'claro' ? 'oscuro' : 'claro'; document.documentElement.dataset.theme = t; setTema(t); try { localStorage.tema = t; } catch {} };

  if (r[0] === 'join' && r[1] && !me) return html`<${Unirse} token=${r[1]} onOk=${cargaMe} />`;
  if (err && /authenticated/i.test(err.message)) return html`<${Login} onOk=${cargaMe} version=${version} />`;
  if (err) return html`<main><div class="panel"><h2>Cannot access the app</h2><p>${err.message}</p></div></main>`;
  if (!me) return html`<p class="cargando">Loading…</p>`;
  if (me.debe_cambiar) return html`<${CambiarPassword} me=${me} forzado onOk=${cargaMe} />`;
  if (!cat) return html`<p class="cargando">Loading…</p>`;
  const salir = async () => { await api('logout', { method: 'POST' }).catch(() => {}); setMe(null); setErr(new Error('Not authenticated')); };
  const [vista, a] = r;
  const grupos = [
    ['', [['inicio', 'Home', 'What needs you today: lines to estimate, requests to assign, what ends soon']]],
    ['Requests', [['demandas', 'Requests', 'All requests as a list, with filters and cost'], ['kanban', 'Kanban', 'Requests by status. Drag a card to move it'],
      ['gantt', 'Gantt', 'Who is doing what and when, by person or by request'], ['capacidad', 'Capacity', 'Monthly load of each person against their capacity']]],
    ['Data', [['maestros', 'Lists', 'Clients and projects, agencies, managers and contacts, team'], ['historial', 'History', 'Who changed what, and when']]],
    ...(me.admin ? [['Admin', [['usuarios', 'Users', 'Access and roles'], ['ajustes', 'Settings', 'Rates, priority rules, AI and the API for Claude']]]] : []),
    ['', [['ayuda', 'Help', 'How Nicole works and who can do what']]],
  ];
  const vistas = me.preferencias?.vistas || [];
  const activo = vista === 'demanda' ? 'demandas' : vista;
  const iniciales = (me.nombre || me.usuario || me.email).split(/[\s.@]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  const vistaActiva = new URLSearchParams(location.hash.split('?')[1] || '').get('vista');
  return html`
    <a class="saltar" href="#contenido" onClick=${(e) => { e.preventDefault(); document.getElementById('contenido')?.focus(); }}>Skip to content</a>
    <header class="movil">
      <${Logo} /><b>Nicole</b><span class="spacer"></span>
      <button class="icono" aria-label=${tema === 'claro' ? 'Switch to dark theme' : 'Switch to light theme'} onClick=${cambiaTema}>${tema === 'claro' ? ICONOS.luna : ICONOS.sol}</button>
      <a class="yo" href="#/cuenta" aria-label="My account"><span class="avatar" aria-hidden="true">${iniciales}</span></a>
      <button class="icono" aria-label="Sign out" onClick=${salir}>${ICONOS.salir}</button>
    </header>
    <div class=${`shell${menuCorto ? ' corto' : ''}`}>
      <aside class="side">
        <div class="marca"><${Logo} /><b>Nicole</b></div>
        <nav aria-label="Main">
          ${grupos.map(([g, xs]) => html`<div class=${`nav-grupo${g ? '' : ' sin-titulo'}`} role="group" aria-label=${g || 'Home'}>${g && html`<div class="nav-h" aria-hidden="true">${g}</div>`}
            ${xs.map(([k, n, d]) => html`<a href=${`#/${k}`} class=${activo === k && !vistaActiva ? 'on' : ''} aria-current=${activo === k ? 'page' : undefined} title=${`${n}: ${d}`}>
              ${ICONOS[k] || ICONOS.ayuda}<span>${n}</span>${k === 'inicio' && nAvisos > 0 ? html`<em aria-label=${`${nAvisos} things for you`}>${nAvisos}</em>` : ''}</a>`)}</div>`)}
          ${vistas.length > 0 && html`<div class="nav-grupo" role="group" aria-label="My views"><div class="nav-h" aria-hidden="true">My views</div>
            ${vistas.map((v) => html`<a href=${`#/${v.pagina}?vista=${v.id}`} class=${vistaActiva === v.id ? 'on' : ''} title=${`${v.nombre} (${TITULOS[v.pagina] || v.pagina})${v.defecto ? ' · default' : ''}`}>
              ${ICONOS[v.pagina] || ICONOS.estrella}<span>${v.nombre}</span></a>`)}</div>`}
        </nav>
        <span class="spacer"></span>
        <div class="pie">
          <button class="icono" aria-label=${tema === 'claro' ? 'Switch to dark theme' : 'Switch to light theme'} title="Light / dark theme" onClick=${cambiaTema}>${tema === 'claro' ? ICONOS.luna : ICONOS.sol}</button>
          ${me.admin && html`<button class="icono" aria-label="Invite someone" title="Invite someone" onClick=${() => setInvitar(true)}>${ICONOS.compartir}</button>`}
          <button class="icono" aria-label=${menuCorto ? 'Expand menu' : 'Collapse menu'} aria-pressed=${menuCorto} title="Collapse menu" onClick=${() => setMenuCorto(!menuCorto)}>${ICONOS.plegar}</button>
          <a class="yo" href="#/cuenta" title="My account"><span class="avatar" aria-hidden="true">${iniciales}</span><span>${me.usuario || me.email}<small>${rolNombre(me.rol)}</small></span></a>
          <button class="icono" aria-label="Sign out" title="Sign out" onClick=${salir}>${ICONOS.salir}</button>
        </div>
        ${version && html`<div class="version" title="App version">v${version}</div>`}
      </aside>
      <main key=${vista} class="vista" id="contenido" tabindex="-1">
        ${vista === 'inicio' && html`<${Inicio} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${(vista === 'demandas' || vista === 'join') && html`<${Lista} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'kanban' && html`<${Kanban} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'gantt' && html`<${Gantt} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'capacidad' && html`<${Capacidad} me=${me} cat=${cat} />`}
        ${vista === 'demanda' && html`<${Demanda} id=${Number(a)} key=${a} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'maestros' && html`<${Maestros} tab=${a || 'clientes'} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'historial' && html`<${Historial} />`}
        ${vista === 'usuarios' && me.admin && html`<${Usuarios} me=${me} cat=${cat} onInvitar=${() => setInvitar(true)} />`}
        ${vista === 'ajustes' && me.admin && html`<${Ajustes} me=${me} cat=${cat} recargaCat=${recargaCat} />`}
        ${vista === 'ayuda' && html`<${Ayuda} me=${me} />`}
        ${vista === 'cuenta' && html`<${CambiarPassword} me=${me} onOk=${cargaMe} version=${version} />`}
        ${!TITULOS[vista] && vista !== 'join' && html`<div class="panel"><h2>Page not found</h2><p><a href="#/inicio">Go home</a></p></div>`}
      </main>
    </div>
    ${invitar && html`<${Compartir} onClose=${() => setInvitar(false)} />`}`;
}

render(html`<${App} />`, document.getElementById('app'));

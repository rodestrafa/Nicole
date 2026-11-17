// API de Nicole: demanda de innovación (PoCs, implementaciones, demos…). Un único router para Cloudflare Pages Functions.
// Misma base que Charlize (login propio, sesiones, invitaciones, IA con Workers AI o Claude), con datos y base de datos propios.
import { CLIENTES, AGENCIAS, EQUIPO, SECTORES, PAISES, REGLAS_PRIORIDAD, prioridadSugerida } from './_maestros.js';

const APP_VERSION = '1.0.0';

// ---------- Catálogos ----------
const ROLES = ['admin', 'principal_director', 'director', 'architect', 'pm', 'builder'];
// New: la tiene el director, sin asignar · Assigned: asignada, pendiente de estimar · Planned: estimada y con fechas
// In progress: en marcha · Done: terminada. Descartar = archivar.
const ESTADOS = ['new', 'assigned', 'planned', 'progress', 'done'];
const TIPOS = ['poc', 'implementacion', 'investigacion', 'demo', 'ensenar_agencia', 'mejora', 'soporte', 'formacion', 'asesoria', 'charla', 'boletin'];
const PRIORIDADES = ['Crítica', 'Alta', 'Media', 'Baja'];
const CRITICIDADES = ['Alta', 'Media', 'Baja'];
const TIPOS_DOC = ['Presentación', 'Estimación', 'Diseño técnico', 'Alcance', 'Otro'];
const AREAS_CONTACTO = ['Manager', 'Sector', 'AS', 'Cliente', 'Otro'];
const MADUREZ = ['concepto', 'construccion', 'beta', 'productiva'];

// Qué puede hacer cada rol (propuesta v1.0; se cambia aquí).
// - Todos crean requests y adjuntan ficheros.
// - Asignar (repartir líneas a personas y estimar cualquier línea): admin, directores y PM.
// - Cada persona asignada estima su línea y mueve el estado de las requests en las que trabaja.
// - Priorizar (cambiar la prioridad) y archivar/descartar: admin y directores. Borrar: admin.
// - Ver costes: admin, directores y PM. Las tarifas solo las ve y cambia el admin.
const PERMISOS = {
  editar: ['admin', 'principal_director', 'director', 'architect', 'pm'],
  asignar: ['admin', 'principal_director', 'director', 'pm'],
  priorizar: ['admin', 'principal_director', 'director'],
  costes: ['admin', 'principal_director', 'director', 'pm'],
  maestros: ['admin', 'principal_director', 'director', 'architect', 'pm'],
};
const puede = (rol, accion) => rol === 'admin' || (PERMISOS[accion] || []).includes(rol);

const DEM_CAMPOS = ['titulo', 'tipo', 'estado', 'prioridad', 'criticidad', 'cliente_id', 'proyecto_id', 'manager_id', 'pais', 'sponsor', 'descripcion', 'beneficio',
  'tecnologias', 'cuenta_cargo', 'importe', 'esfuerzo_estimado', 'fecha_solicitud', 'fecha_inicio', 'fecha_fin', 'notas', 'archivada'];
const NUMERICOS = new Set(['cliente_id', 'proyecto_id', 'manager_id', 'importe', 'esfuerzo_estimado', 'archivada']);
const FECHAS = new Set(['fecha_solicitud', 'fecha_inicio', 'fecha_fin']);

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
const err = (msg, status = 400) => json({ error: msg }, status);
const fechaOk = (f) => f == null || f === '' || /^\d{4}-\d{2}-\d{2}$/.test(String(f));
const txt = (v, max = 4000) => (v == null || v === '' ? null : String(v).trim().slice(0, max) || null);

async function log(db, entidad, entidad_id, accion, detalle, usuario) {
  await db.prepare('INSERT INTO eventos (entidad, entidad_id, accion, detalle, usuario) VALUES (?,?,?,?,?)')
    .bind(entidad, String(entidad_id), accion, detalle ?? null, usuario).run();
}

// ---------- Esquema y maestros iniciales ----------
// Crea lo que falte al primer uso de cada instancia (nunca borra) y, si las tablas están vacías, carga clientes y agencias.
const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, usuario TEXT UNIQUE, nombre TEXT, rol TEXT NOT NULL DEFAULT 'builder', hash TEXT NOT NULL, salt TEXT NOT NULL,
  debe_cambiar INTEGER NOT NULL DEFAULT 1, intentos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta TEXT, ultimo_acceso TEXT, preferencias TEXT, creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, email TEXT NOT NULL, expira TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS invitaciones (token TEXT PRIMARY KEY, rol TEXT NOT NULL DEFAULT 'builder', creado_por TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now')), expira TEXT NOT NULL, usado_por TEXT);
CREATE TABLE IF NOT EXISTS clientes (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, codigo TEXT, sector TEXT, client_family TEXT, pais TEXT, activo INTEGER NOT NULL DEFAULT 1,
  origen TEXT DEFAULT 'app', creado TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(nombre, codigo));
CREATE TABLE IF NOT EXISTS proyectos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER NOT NULL, nombre TEXT NOT NULL, codigo TEXT, cuenta_cargo TEXT, activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(cliente_id, nombre));
CREATE TABLE IF NOT EXISTS agencias (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, dominio TEXT, madurez TEXT, resumen TEXT, activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS personas (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT, rol TEXT, funcion TEXT, tarifa_dia REAL, capacidad INTEGER NOT NULL DEFAULT 100, activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS contactos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, email TEXT, area TEXT, es_manager INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS demandas (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'poc', estado TEXT NOT NULL DEFAULT 'new', prioridad TEXT DEFAULT 'Media',
  criticidad TEXT, cliente_id INTEGER, proyecto_id INTEGER, manager_id INTEGER, pais TEXT, sponsor TEXT, descripcion TEXT, beneficio TEXT, tecnologias TEXT, cuenta_cargo TEXT, importe REAL,
  esfuerzo_estimado REAL, fecha_solicitud TEXT, fecha_inicio TEXT, fecha_fin TEXT, notas TEXT, archivada INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')), creado_por TEXT);
CREATE INDEX IF NOT EXISTS idx_dem_estado ON demandas(estado, archivada);
CREATE TABLE IF NOT EXISTS demanda_agencias (demanda_id INTEGER NOT NULL, agencia_id TEXT NOT NULL, PRIMARY KEY (demanda_id, agencia_id));
CREATE TABLE IF NOT EXISTS demanda_personas (id INTEGER PRIMARY KEY AUTOINCREMENT, demanda_id INTEGER NOT NULL, persona_id INTEGER NOT NULL, agencia_id TEXT, funcion TEXT,
  jornadas REAL, dedicacion INTEGER, inicio TEXT, fin TEXT, estimado INTEGER NOT NULL DEFAULT 0, creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_dp_dem ON demanda_personas(demanda_id);
CREATE TABLE IF NOT EXISTS avisos (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, demanda_id INTEGER, texto TEXT NOT NULL, leido INTEGER NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_avisos ON avisos(email, leido);
CREATE TABLE IF NOT EXISTS demanda_contactos (demanda_id INTEGER NOT NULL, contacto_id INTEGER NOT NULL, tipo TEXT NOT NULL DEFAULT 'informar', PRIMARY KEY (demanda_id, contacto_id, tipo));
CREATE TABLE IF NOT EXISTS adjuntos (id INTEGER PRIMARY KEY AUTOINCREMENT, demanda_id INTEGER NOT NULL, nombre TEXT NOT NULL, tipo_doc TEXT, mime TEXT, tamano INTEGER, clave_r2 TEXT, datos TEXT,
  subido_por TEXT, fecha TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_adj_dem ON adjuntos(demanda_id);
CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, entidad TEXT NOT NULL, entidad_id TEXT NOT NULL, accion TEXT NOT NULL, detalle TEXT, usuario TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_evt ON eventos(entidad, entidad_id);
CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS uso_ia (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL, tipo TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now')));`;

let esquemaOk = false;
async function ensureSchema(db) {
  if (esquemaOk) return;
  await db.batch(ESQUEMA.split(';').map((s) => s.trim()).filter(Boolean).map((s) => db.prepare(s)));
  if (!(await db.prepare('SELECT 1 FROM clientes LIMIT 1').first())) {
    await db.batch(CLIENTES.map(([n, c, s, f, p]) => db.prepare(`INSERT OR IGNORE INTO clientes (nombre, codigo, sector, client_family, pais, origen) VALUES (?,?,?,?,?, 'budget')`).bind(n, c, s, f, p)));
  }
  if (!(await db.prepare('SELECT 1 FROM agencias LIMIT 1').first())) {
    await db.batch(AGENCIAS.map(([id, n, d, m, r]) => db.prepare('INSERT OR IGNORE INTO agencias (id, nombre, dominio, madurez, resumen) VALUES (?,?,?,?,?)').bind(id, n, d, m, r)));
  }
  if (!(await db.prepare('SELECT 1 FROM personas LIMIT 1').first())) {
    await db.batch(EQUIPO.map(([n, r, f]) => db.prepare('INSERT INTO personas (nombre, rol, funcion) VALUES (?,?,?)').bind(n, r, f)));
  }
  esquemaOk = true;
}

// ---------- Ajustes: tarifas por rol (€/día) y topes de la IA ----------
const AJUSTES_BASE = {
  ia_activa: 1, ia_usuario_dia: 20, ia_total_mes: 3000,
  ...Object.fromEntries(ROLES.map((r) => [`tarifa_${r}`, 0])),
};
async function leeAjustes(db) {
  const { results } = await db.prepare('SELECT clave, valor FROM ajustes').all();
  const out = { ...AJUSTES_BASE };
  for (const r of results) if (r.clave in AJUSTES_BASE) out[r.clave] = Number(r.valor) || 0;
  return out;
}
async function leeReglas(db) {
  const r = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'reglas_prioridad'`).first();
  try { const v = JSON.parse(r?.valor || 'null'); if (Array.isArray(v)) return v; } catch {}
  return REGLAS_PRIORIDAD;
}
async function guardaAjustes(db, body, user) {
  if (Array.isArray(body.reglas_prioridad)) {
    const reglas = body.reglas_prioridad.filter((x) => x && ['cliente', 'family', 'sector', 'pais', 'fuera_espana'].includes(x.campo) && PRIORIDADES.includes(x.prioridad))
      .map((x) => ({ campo: x.campo, texto: String(x.texto || '').trim().slice(0, 80), prioridad: x.prioridad })).slice(0, 60);
    await db.prepare(`INSERT INTO ajustes (clave, valor) VALUES ('reglas_prioridad', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).bind(JSON.stringify(reglas)).run();
    await log(db, 'ajustes', 'reglas_prioridad', 'editada', `${reglas.length} priority rules`, user);
  }
  const antes = await leeAjustes(db);
  for (const k of Object.keys(AJUSTES_BASE)) {
    if (!(k in body)) continue;
    const v = Math.round(Number(body[k]) * 100) / 100;
    if (!(v >= 0 && v <= 100000)) return err(`Invalid value for ${k}`);
    await db.prepare('INSERT INTO ajustes (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor').bind(k, String(v)).run();
    if (v !== antes[k]) await log(db, 'ajustes', k, 'editada', `${antes[k]} → ${v}`, user);
  }
  return json({ ...(await leeAjustes(db)), reglas_prioridad: await leeReglas(db) });
}

// ---------- Catálogos para la interfaz ----------
async function catalogos(db, rol) {
  const q = (s) => db.prepare(s).all().then((r) => r.results);
  const [clientes, proyectos, agencias, personas, contactos, tecs] = await Promise.all([
    q('SELECT id, nombre, codigo, sector, client_family, pais, activo, origen FROM clientes ORDER BY sector, client_family, nombre'),
    q('SELECT id, cliente_id, nombre, codigo, cuenta_cargo, activo FROM proyectos ORDER BY nombre'),
    q('SELECT id, nombre, dominio, madurez, resumen, activo FROM agencias ORDER BY dominio, nombre'),
    q(`SELECT id, nombre, email, rol, funcion, ${rol === 'admin' ? 'tarifa_dia,' : ''} capacidad, activo FROM personas ORDER BY nombre`),
    q('SELECT id, nombre, email, area, es_manager, activo FROM contactos ORDER BY nombre'),
    q(`SELECT tecnologias FROM demandas WHERE tecnologias IS NOT NULL AND tecnologias <> ''`),
  ]);
  const tecnologias = [...new Set(tecs.flatMap((r) => r.tecnologias.split(',').map((t) => t.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
  const sectores = [...new Set([...SECTORES, ...clientes.map((c) => c.sector).filter(Boolean)])];
  const paises = [...new Set([...PAISES, ...clientes.map((c) => c.pais).filter(Boolean)])];
  return { clientes, proyectos, agencias, personas, contactos, tecnologias, sectores, paises, reglas_prioridad: await leeReglas(db), roles: ROLES, estados: ESTADOS, tipos: TIPOS,
    prioridades: PRIORIDADES, criticidades: CRITICIDADES, tipos_doc: TIPOS_DOC, areas_contacto: AREAS_CONTACTO, madurez: MADUREZ };
}

// ---------- Demandas ----------
// Coste = Σ jornadas × tarifa (la de la persona o, si no tiene, la de su rol). Sin personas: esfuerzo estimado × tarifa media de los roles con tarifa.
function calculaCoste(d, personas, aj) {
  const tarifaRol = (r) => Number(aj[`tarifa_${r}`]) || 0;
  let total = 0, faltan = 0;
  const lineas = personas.map((p) => {
    const tarifa = Number(p.tarifa_dia) || tarifaRol(p.rol);
    const coste = p.jornadas && tarifa ? p.jornadas * tarifa : null;
    if (p.jornadas && !tarifa) faltan++;
    if (coste) total += coste;
    return { id: p.id, persona_id: p.persona_id, tarifa: tarifa || null, coste };
  });
  const jornadas = personas.reduce((s, p) => s + (Number(p.jornadas) || 0), 0);
  if (!jornadas && d.esfuerzo_estimado) {
    const tarifas = ROLES.map(tarifaRol).filter(Boolean);
    const media = tarifas.length ? tarifas.reduce((a, b) => a + b, 0) / tarifas.length : 0;
    if (media) total = d.esfuerzo_estimado * media; else faltan++;
    return { total: total || null, jornadas: d.esfuerzo_estimado, base: 'estimado', faltan_tarifas: faltan, lineas };
  }
  return { total: total || null, jornadas: jornadas || null, base: 'personas', faltan_tarifas: faltan, lineas };
}

const SQL_DEM = `SELECT d.*, c.nombre AS cliente, c.sector, c.client_family, c.pais AS cliente_pais, c.codigo AS cliente_codigo, p.nombre AS proyecto, m.nombre AS manager,
  COALESCE((SELECT u.usuario FROM usuarios u WHERE u.email = d.creado_por), d.creado_por) AS creado_por_usuario,
  (SELECT COUNT(*) FROM adjuntos a WHERE a.demanda_id = d.id) AS n_adjuntos
  FROM demandas d LEFT JOIN clientes c ON c.id = d.cliente_id LEFT JOIN proyectos p ON p.id = d.proyecto_id LEFT JOIN contactos m ON m.id = d.manager_id`;

async function relaciones(db, ids) {
  if (!ids.length) return { ag: [], pe: [], co: [] };
  const lista = ids.join(',');
  const [ag, pe, co] = await Promise.all([
    db.prepare(`SELECT demanda_id, agencia_id FROM demanda_agencias WHERE demanda_id IN (${lista})`).all(),
    db.prepare(`SELECT dp.*, pe.nombre, pe.email, pe.rol, pe.tarifa_dia, pe.capacidad FROM demanda_personas dp JOIN personas pe ON pe.id = dp.persona_id WHERE dp.demanda_id IN (${lista}) ORDER BY dp.id`).all(),
    db.prepare(`SELECT dc.demanda_id, dc.contacto_id, dc.tipo, c.nombre, c.area FROM demanda_contactos dc JOIN contactos c ON c.id = dc.contacto_id WHERE dc.demanda_id IN (${lista})`).all(),
  ]);
  return { ag: ag.results, pe: pe.results, co: co.results };
}

function componeDemanda(d, rel, aj, verCostes) {
  const personas = rel.pe.filter((x) => x.demanda_id === d.id);
  const out = {
    ...d,
    pais_propio: d.pais || null,
    pais: d.pais || d.cliente_pais || null,
    agencias: rel.ag.filter((x) => x.demanda_id === d.id).map((x) => x.agencia_id),
    personas: personas.map(({ tarifa_dia, ...p }) => p),
    informar: rel.co.filter((x) => x.demanda_id === d.id && x.tipo === 'informar').map((x) => ({ id: x.contacto_id, nombre: x.nombre, area: x.area })),
    otros: rel.co.filter((x) => x.demanda_id === d.id && x.tipo === 'otro').map((x) => ({ id: x.contacto_id, nombre: x.nombre, area: x.area })),
  };
  const coste = calculaCoste(d, personas, aj);
  out.jornadas = coste.jornadas;
  if (verCostes) out.coste = coste; else { delete out.importe; }
  return out;
}

async function listDemandas(db, url, rol) {
  const arch = url.searchParams.get('archivadas') === '1' ? 1 : 0;
  const { results } = await db.prepare(`${SQL_DEM} WHERE d.archivada = ? ORDER BY d.actualizado DESC`).bind(arch).all();
  const rel = await relaciones(db, results.map((d) => d.id));
  const aj = await leeAjustes(db);
  return json(results.map((d) => componeDemanda(d, rel, aj, puede(rol, 'costes'))));
}

async function getDemanda(db, id, rol) {
  const d = await db.prepare(`${SQL_DEM} WHERE d.id = ?`).bind(id).first();
  if (!d) return err('Demand not found', 404);
  const rel = await relaciones(db, [id]);
  const aj = await leeAjustes(db);
  const out = componeDemanda(d, rel, aj, puede(rol, 'costes'));
  out.adjuntos = (await db.prepare(`SELECT a.id, a.nombre, a.tipo_doc, a.mime, a.tamano, a.fecha, COALESCE(u.usuario, a.subido_por) AS subido_por
    FROM adjuntos a LEFT JOIN usuarios u ON u.email = a.subido_por WHERE a.demanda_id = ? ORDER BY a.fecha DESC`).bind(id).all()).results;
  out.eventos = (await db.prepare(`SELECT e.fecha, e.accion, e.detalle, COALESCE(u.usuario, e.usuario) AS usuario FROM eventos e LEFT JOIN usuarios u ON u.email = e.usuario
    WHERE e.entidad = 'demanda' AND e.entidad_id = ? ORDER BY e.fecha DESC, e.id DESC LIMIT 100`).bind(String(id)).all()).results;
  return json(out);
}

function limpiaDemanda(body) {
  const d = {};
  for (const k of DEM_CAMPOS) {
    if (!(k in body)) continue;
    let v = body[k];
    if (v === '' || v === undefined) v = null;
    if (NUMERICOS.has(k) && v != null) { v = Number(v); if (!Number.isFinite(v)) return { error: `${k} must be a number` }; }
    if (FECHAS.has(k) && !fechaOk(v)) return { error: `${k}: use the format YYYY-MM-DD` };
    if (typeof v === 'string') v = v.trim().slice(0, k === 'descripcion' || k === 'notas' || k === 'beneficio' ? 20000 : 500);
    d[k] = v;
  }
  if ('titulo' in d && !d.titulo) return { error: 'The title is required' };
  if ('tipo' in d && !TIPOS.includes(d.tipo)) return { error: 'Unknown type' };
  if ('estado' in d && !ESTADOS.includes(d.estado)) return { error: 'Unknown status' };
  if (d.prioridad && !PRIORIDADES.includes(d.prioridad)) return { error: 'Unknown priority' };
  if (d.criticidad && !CRITICIDADES.includes(d.criticidad)) return { error: 'Unknown criticality' };
  if (d.fecha_inicio && d.fecha_fin && d.fecha_fin < d.fecha_inicio) return { error: 'The end date is before the start date' };
  if ('tecnologias' in d && d.tecnologias) d.tecnologias = [...new Set(d.tecnologias.split(',').map((t) => t.trim()).filter(Boolean))].join(', ');
  return { d };
}

// ---------- Líneas: qué agencia o trabajo hace cada persona dentro de la request, con su estimación ----------
const num = (v, min = 0, max = 100000) => (v === '' || v == null ? null : Math.min(max, Math.max(min, Number(v))) || 0);
function limpiaLinea(p) {
  const l = { persona_id: Number(p.persona_id) || null, agencia_id: txt(p.agencia_id, 80), funcion: txt(p.funcion, 400), jornadas: num(p.jornadas),
    dedicacion: p.dedicacion === '' || p.dedicacion == null ? null : Math.round(num(p.dedicacion, 0, 100)), inicio: txt(p.inicio, 10), fin: txt(p.fin, 10) };
  if (!fechaOk(l.inicio) || !fechaOk(l.fin)) return { error: 'Line dates: use the format YYYY-MM-DD' };
  if (l.inicio && l.fin && l.fin < l.inicio) return { error: 'A line ends before it starts' };
  l.estimado = l.jornadas != null ? 1 : 0;
  return { l };
}
async function avisa(db, personaId, demandaId, texto, actor) {
  const p = await db.prepare('SELECT email FROM personas WHERE id = ?').bind(personaId).first();
  const email = p?.email ? String(p.email).toLowerCase() : null;
  if (!email || email === actor) return;
  await db.prepare('INSERT INTO avisos (email, demanda_id, texto) VALUES (?,?,?)').bind(email, demandaId, texto).run();
}
async function avisaEquipo(db, demandaId, texto, actor) {
  const { results } = await db.prepare(`SELECT DISTINCT lower(p.email) AS email FROM demanda_personas dp JOIN personas p ON p.id = dp.persona_id
    WHERE dp.demanda_id = ? AND p.email IS NOT NULL AND p.email <> ''`).bind(demandaId).all();
  const to = results.map((r) => r.email).filter((e) => e !== actor);
  if (to.length) await db.batch(to.map((e) => db.prepare('INSERT INTO avisos (email, demanda_id, texto) VALUES (?,?,?)').bind(e, demandaId, texto)));
}
async function guardaLineas(db, id, items, user, titulo) {
  const antes = (await db.prepare('SELECT * FROM demanda_personas WHERE demanda_id = ?').bind(id).all()).results;
  const cambios = [], quedan = new Set();
  for (const p of items) {
    const { l, error } = limpiaLinea(p);
    if (error) throw Object.assign(new Error(error), { status: 400 });
    if (!l.persona_id) continue;
    const prev = antes.find((x) => x.id === Number(p.id));
    if (prev) {
      quedan.add(prev.id);
      await db.prepare('UPDATE demanda_personas SET persona_id = ?, agencia_id = ?, funcion = ?, jornadas = ?, dedicacion = ?, inicio = ?, fin = ?, estimado = ? WHERE id = ?')
        .bind(l.persona_id, l.agencia_id, l.funcion, l.jornadas, l.dedicacion, l.inicio, l.fin, l.estimado, prev.id).run();
      if (prev.persona_id !== l.persona_id) await avisa(db, l.persona_id, id, `You have been assigned to “${titulo}”. Please estimate your part`, user);
    } else {
      const r = await db.prepare('INSERT INTO demanda_personas (demanda_id, persona_id, agencia_id, funcion, jornadas, dedicacion, inicio, fin, estimado) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id')
        .bind(id, l.persona_id, l.agencia_id, l.funcion, l.jornadas, l.dedicacion, l.inicio, l.fin, l.estimado).first();
      quedan.add(r.id);
      const ag = l.agencia_id ? await db.prepare('SELECT nombre FROM agencias WHERE id = ?').bind(l.agencia_id).first() : null;
      await avisa(db, l.persona_id, id, `You have been assigned to “${titulo}”${ag ? ` (${ag.nombre})` : ''}. Please estimate your part`, user);
    }
  }
  const fuera = antes.filter((x) => !quedan.has(x.id));
  if (fuera.length) await db.batch(fuera.map((x) => db.prepare('DELETE FROM demanda_personas WHERE id = ?').bind(x.id)));
  const firma = (rs) => JSON.stringify(rs.map((x) => [x.persona_id, x.agencia_id, x.funcion, x.jornadas, x.inicio, x.fin]));
  const ahora = (await db.prepare('SELECT * FROM demanda_personas WHERE demanda_id = ? ORDER BY id').bind(id).all()).results;
  if (firma(antes.sort((a, b) => a.id - b.id)) !== firma(ahora)) cambios.push(`team: ${ahora.length} lines, ${ahora.reduce((s, x) => s + (x.jornadas || 0), 0)} days`);
  return cambios;
}
// Avance automático: New → Assigned al repartir líneas; Assigned → Planned cuando todas están estimadas
async function autoEstado(db, id, user) {
  const d = await db.prepare('SELECT estado, titulo FROM demandas WHERE id = ?').bind(id).first();
  const r = await db.prepare('SELECT COUNT(*) AS n, SUM(estimado) AS est FROM demanda_personas WHERE demanda_id = ?').bind(id).first();
  let nuevo = null;
  if (d.estado === 'new' && r.n > 0) nuevo = r.est >= r.n ? 'planned' : 'assigned';
  else if (d.estado === 'assigned' && r.n > 0 && r.est >= r.n) nuevo = 'planned';
  if (!nuevo) return;
  await db.prepare(`UPDATE demandas SET estado = ?, actualizado = datetime('now') WHERE id = ?`).bind(nuevo, id).run();
  await log(db, 'demanda', id, 'estado', `estado: ${d.estado} → ${nuevo} (automatic)`, user);
}
async function esAsignado(db, id, user) {
  return !!(await db.prepare(`SELECT 1 FROM demanda_personas dp JOIN personas p ON p.id = dp.persona_id WHERE dp.demanda_id = ? AND lower(p.email) = ?`).bind(id, user).first());
}
async function estimaLinea(db, lid, body, user, rol) {
  const prev = await db.prepare(`SELECT dp.*, lower(p.email) AS email, d.titulo FROM demanda_personas dp JOIN personas p ON p.id = dp.persona_id JOIN demandas d ON d.id = dp.demanda_id WHERE dp.id = ?`).bind(lid).first();
  if (!prev) return err('Line not found', 404);
  if (!puede(rol, 'asignar') && prev.email !== user) return err('You can only estimate your own lines', 403);
  const { l, error } = limpiaLinea({ ...prev, ...body, persona_id: prev.persona_id });
  if (error) return err(error);
  await db.prepare('UPDATE demanda_personas SET agencia_id = ?, funcion = ?, jornadas = ?, dedicacion = ?, inicio = ?, fin = ?, estimado = ? WHERE id = ?')
    .bind(l.agencia_id, l.funcion, l.jornadas, l.dedicacion, l.inicio, l.fin, l.estimado, lid).run();
  await db.prepare(`UPDATE demandas SET actualizado = datetime('now') WHERE id = ?`).bind(prev.demanda_id).run();
  await log(db, 'demanda', prev.demanda_id, 'estimacion', `${l.jornadas ?? '—'} days${l.inicio ? ` · ${l.inicio} → ${l.fin || '?'}` : ''}${l.agencia_id ? ` · ${l.agencia_id}` : ''}`, user);
  await autoEstado(db, prev.demanda_id, user);
  return json({ ok: true });
}

// Relaciones que llegan en el mismo PUT/POST: agencias, personas (estimación), personas a informar y otros contactos
async function guardaRelaciones(db, id, body, rol, actual, user, titulo) {
  const cambios = [];
  if (Array.isArray(body.agencias)) {
    const ids = [...new Set(body.agencias.map(String))];
    await db.batch([db.prepare('DELETE FROM demanda_agencias WHERE demanda_id = ?').bind(id),
      ...ids.map((a) => db.prepare('INSERT OR IGNORE INTO demanda_agencias (demanda_id, agencia_id) SELECT ?, id FROM agencias WHERE id = ?').bind(id, a))]);
    if (!actual || actual.agencias.join() !== ids.join()) cambios.push(`agencies: ${ids.join(', ') || '—'}`);
  }
  if (Array.isArray(body.personas)) {
    if (actual && !puede(rol, 'asignar')) return { error: 'Only the admin, directors and PMs can assign people. Estimate your own line from it' };
    const r = await guardaLineas(db, id, body.personas, user, titulo);
    cambios.push(...r);
  }
  for (const tipo of ['informar', 'otros']) {
    if (!Array.isArray(body[tipo])) continue;
    const t = tipo === 'otros' ? 'otro' : 'informar';
    const ids = [...new Set(body[tipo].map(Number).filter(Boolean))];
    await db.batch([db.prepare('DELETE FROM demanda_contactos WHERE demanda_id = ? AND tipo = ?').bind(id, t),
      ...ids.map((c) => db.prepare('INSERT OR IGNORE INTO demanda_contactos (demanda_id, contacto_id, tipo) VALUES (?,?,?)').bind(id, c, t))]);
  }
  return { cambios };
}

async function createDemanda(db, body, user, rol) {
  const { d, error } = limpiaDemanda({ estado: 'new', tipo: 'poc', ...body });
  if (error) return err(error);
  if (!d.titulo) return err('The title is required');
  if (!['new', 'assigned'].includes(d.estado) && !puede(rol, 'editar')) d.estado = 'new';
  if (!d.prioridad) {
    const c = d.cliente_id ? await db.prepare('SELECT * FROM clientes WHERE id = ?').bind(d.cliente_id).first() : null;
    d.prioridad = prioridadSugerida(c, d.pais, await leeReglas(db)) || 'Media';
  }
  if (!d.fecha_solicitud) d.fecha_solicitud = new Date().toISOString().slice(0, 10);
  delete d.archivada;
  const cols = Object.keys(d);
  const r = await db.prepare(`INSERT INTO demandas (${cols.join(', ')}, creado_por) VALUES (${cols.map(() => '?').join(', ')}, ?) RETURNING id`)
    .bind(...cols.map((c) => d[c]), user).first();
  await log(db, 'demanda', r.id, 'creada', `“${d.titulo}”${body.origen_ia ? ' · from audio/notes with AI' : ''}${body.origen_api ? ' · via API' : ''}`, user);
  const rel = await guardaRelaciones(db, r.id, body, rol, null, user, d.titulo);
  await autoEstado(db, r.id, user);
  return json({ id: r.id, aviso: rel.error || null }, 201);
}

async function updateDemanda(db, id, body, user, rol) {
  const antes = await db.prepare('SELECT * FROM demandas WHERE id = ?').bind(id).first();
  if (!antes) return err('Demand not found', 404);
  if (!puede(rol, 'editar') && !(await esAsignado(db, id, user))) return err('You can only edit the requests you work on', 403);
  const { d, error } = limpiaDemanda(body);
  if (error) return err(error);
  if ('prioridad' in d && (d.prioridad ?? null) !== (antes.prioridad ?? null) && !puede(rol, 'priorizar')) return err('Only the admin and directors can change the priority', 403);
  if ('archivada' in d && Number(d.archivada) !== antes.archivada && !puede(rol, 'priorizar')) return err('Only the admin and directors can discard or archive requests', 403);
  if (!puede(rol, 'costes')) delete d.importe;
  const cambios = [];
  for (const [k, v] of Object.entries(d)) if ((antes[k] ?? null) != (v ?? null)) cambios.push(['descripcion', 'notas', 'beneficio'].includes(k) ? `${k} edited` : `${k}: ${antes[k] ?? '—'} → ${v ?? '—'}`);
  if (cambios.length) {
    const cols = Object.keys(d);
    await db.prepare(`UPDATE demandas SET ${cols.map((c) => `${c} = ?`).join(', ')}, actualizado = datetime('now') WHERE id = ?`).bind(...cols.map((c) => d[c]), id).run();
  }
  const actual = { agencias: (await db.prepare('SELECT agencia_id FROM demanda_agencias WHERE demanda_id = ? ORDER BY rowid').bind(id).all()).results.map((x) => x.agencia_id) };
  const rel = await guardaRelaciones(db, id, body, rol, actual, user, d.titulo || antes.titulo);
  if (rel.error) return err(rel.error, 403);
  const todo = [...cambios, ...rel.cambios];
  const cambiaEstado = 'estado' in d && d.estado !== antes.estado;
  if (todo.length) {
    if (!cambios.length) await db.prepare(`UPDATE demandas SET actualizado = datetime('now') WHERE id = ?`).bind(id).run();
    await log(db, 'demanda', id, cambiaEstado ? 'estado' : 'editada', todo.join('; '), user);
  }
  if (cambiaEstado) await avisaEquipo(db, id, `“${d.titulo || antes.titulo}” moved to ${d.estado}`, user);
  else await autoEstado(db, id, user);
  return json({ ok: true });
}

// ---------- Adjuntos ----------
const MAX_R2 = 25 * 1024 * 1024;
const MAX_D1 = 1.5 * 1024 * 1024;
async function subeAdjunto(db, env, id, body, user) {
  if (!(await db.prepare('SELECT 1 FROM demandas WHERE id = ?').bind(id).first())) return err('Demand not found', 404);
  const nombre = txt(body.nombre, 200);
  const b64 = String(body.datos || '').replace(/^data:[^,]*,/, '');
  if (!nombre || !b64) return err('No file received');
  const tamano = Math.floor(b64.length * 3 / 4);
  const tipo_doc = TIPOS_DOC.includes(body.tipo_doc) ? body.tipo_doc : 'Otro';
  const mime = txt(body.mime, 120) || 'application/octet-stream';
  let clave = null, datos = null;
  if (env.ADJUNTOS) {
    if (tamano > MAX_R2) return err('File too large: up to 25 MB');
    clave = `demandas/${id}/${Date.now()}-${nombre.replace(/[^\w.\- ]+/g, '_')}`;
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    await env.ADJUNTOS.put(clave, bin, { httpMetadata: { contentType: mime } });
  } else {
    if (tamano > MAX_D1) return err('File too large: without file storage (R2) the limit is 1.5 MB. Ask the admin to enable R2');
    datos = b64;
  }
  const r = await db.prepare('INSERT INTO adjuntos (demanda_id, nombre, tipo_doc, mime, tamano, clave_r2, datos, subido_por) VALUES (?,?,?,?,?,?,?,?) RETURNING id')
    .bind(id, nombre, tipo_doc, mime, tamano, clave, datos, user).first();
  await db.prepare(`UPDATE demandas SET actualizado = datetime('now') WHERE id = ?`).bind(id).run();
  await log(db, 'demanda', id, 'adjunto', `${tipo_doc}: ${nombre}`, user);
  return json({ id: r.id }, 201);
}
async function bajaAdjunto(db, env, id) {
  const a = await db.prepare('SELECT * FROM adjuntos WHERE id = ?').bind(id).first();
  if (!a) return err('File not found', 404);
  let cuerpo;
  if (a.clave_r2) {
    if (!env.ADJUNTOS) return err('File storage (R2) is not connected', 503);
    const o = await env.ADJUNTOS.get(a.clave_r2);
    if (!o) return err('File not found in storage', 404);
    cuerpo = o.body;
  } else cuerpo = Uint8Array.from(atob(a.datos || ''), (c) => c.charCodeAt(0));
  return new Response(cuerpo, { headers: { 'content-type': a.mime || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(a.nombre)}` } });
}
async function borraAdjunto(db, env, id, user) {
  const a = await db.prepare('SELECT * FROM adjuntos WHERE id = ?').bind(id).first();
  if (!a) return err('File not found', 404);
  if (a.clave_r2 && env.ADJUNTOS) await env.ADJUNTOS.delete(a.clave_r2);
  await db.prepare('DELETE FROM adjuntos WHERE id = ?').bind(id).run();
  await log(db, 'demanda', a.demanda_id, 'adjunto', `Deleted: ${a.nombre}`, user);
  return json({ ok: true });
}

// ---------- Maestros: clientes, proyectos, agencias, personas, contactos ----------
const MAESTROS = {
  clientes: { campos: ['nombre', 'codigo', 'sector', 'client_family', 'pais', 'activo'], req: 'nombre', permiso: 'maestros' },
  proyectos: { campos: ['cliente_id', 'nombre', 'codigo', 'cuenta_cargo', 'activo'], req: 'nombre', permiso: 'maestros' },
  contactos: { campos: ['nombre', 'email', 'area', 'es_manager', 'activo'], req: 'nombre', permiso: 'maestros' },
  personas: { campos: ['nombre', 'email', 'rol', 'funcion', 'tarifa_dia', 'capacidad', 'activo'], req: 'nombre', permiso: 'admin' },
  agencias: { campos: ['id', 'nombre', 'dominio', 'madurez', 'resumen', 'activo'], req: 'nombre', permiso: 'admin' },
};
async function maestro(db, res, m, id, body, user, rol) {
  const def = MAESTROS[res];
  if (def.permiso === 'admin' ? rol !== 'admin' : !puede(rol, def.permiso)) return err('You do not have permission to change this list', 403);
  const v = {};
  for (const c of def.campos) if (c in body) v[c] = body[c] === '' ? null : typeof body[c] === 'string' ? body[c].trim().slice(0, 2000) : body[c];
  if (v.email) v.email = String(v.email).toLowerCase();
  if (res === 'proyectos' && m === 'POST' && !(await db.prepare('SELECT 1 FROM clientes WHERE id = ?').bind(Number(v.cliente_id)).first())) return err('Choose the client first');
  if (res === 'personas' && v.rol && !ROLES.includes(v.rol)) return err('Unknown role');
  if (res === 'agencias' && v.madurez && !MADUREZ.includes(v.madurez)) return err('Unknown maturity');
  if (res === 'agencias' && m === 'POST') v.id = String(v.id || v.nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  if (m === 'POST') {
    if (!v[def.req]) return err('The name is required');
    if (res === 'clientes') v.origen = 'app';
    const cols = Object.keys(v);
    try {
      const r = await db.prepare(`INSERT INTO ${res} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) RETURNING id`).bind(...cols.map((c) => v[c])).first();
      await log(db, res.replace(/s$/, ''), r.id, 'creada', v.nombre, user);
      return json({ id: r.id }, 201);
    } catch (e) { return err(/UNIQUE/.test(e.message) ? 'It already exists' : e.message, 409); }
  }
  if (m === 'PUT' && id) {
    delete v.id;
    if (res === 'proyectos') delete v.cliente_id;
    const cols = Object.keys(v);
    if (!cols.length) return json({ ok: true });
    if ('nombre' in v && !v.nombre) return err('The name is required');
    await db.prepare(`UPDATE ${res} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => v[c]), res === 'agencias' ? id : Number(id)).run();
    await log(db, res.replace(/s$/, ''), id, 'editada', cols.map((c) => `${c}: ${c === 'tarifa_dia' ? '***' : v[c] ?? '—'}`).join('; '), user);
    return json({ ok: true });
  }
  return err('Route not found', 404);
}

// ---------- IA: audio a texto (Whisper en Workers AI) y texto a demanda ----------
// Sin clave de Anthropic se usa un modelo abierto de Workers AI (gratis dentro del cupo diario de Cloudflare).
const MODELO_IA = 'claude-haiku-5-5';
const MODELO_CF = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const proveedorIA = (env) => (env.ANTHROPIC_API_KEY ? 'claude' : env.AI ? 'cloudflare' : null);
async function workersIA(env, { system, content, schema, max_tokens }) {
  const opts = { messages: [{ role: 'system', content: system }, { role: 'user', content }], max_tokens: Math.min(max_tokens, 8000), temperature: 0.2 };
  if (schema) opts.response_format = { type: 'json_schema', json_schema: schema };
  let r;
  try { r = await env.AI.run(MODELO_CF, opts); } catch (x0) {
    let x = x0;
    if (opts.response_format && !/limit|quota|neuron|429/i.test(x0.message)) { delete opts.response_format; try { r = await env.AI.run(MODELO_CF, opts); x = null; } catch (x1) { x = x1; } }
    if (x) { const e = new Error(/limit|quota|neuron|429/i.test(x.message) ? 'Today\'s free AI allowance in Cloudflare is used up. Try again tomorrow' : `AI error: ${x.message}`); e.status = 502; throw e; }
  }
  const out = r?.response;
  if (out == null) { const e = new Error('The AI returned no answer'); e.status = 502; throw e; }
  return typeof out === 'string' ? out : JSON.stringify(out);
}
async function llamaIA(env, { system, content, schema, max_tokens = 3000 }) {
  if (!env.ANTHROPIC_API_KEY && env.AI) return workersIA(env, { system, content, schema, max_tokens });
  if (!env.ANTHROPIC_API_KEY) { const e = new Error('AI is not set up: the Workers AI binding is missing'); e.status = 503; throw e; }
  const body = { model: MODELO_IA, max_tokens, system, messages: [{ role: 'user', content }], output_config: { effort: 'low' } };
  if (schema) body.output_config.format = { type: 'json_schema', schema };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`AI error ${r.status}: ${d.error?.message || 'no details'}`); e.status = 502; throw e; }
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}
const jsonDe = (t) => {
  const s = String(t).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(s); } catch {
    const m = s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1);
    return JSON.parse(m.replace(/"(?:[^"\\]|\\.)*"/g, (x) => x.replace(/\r/g, '').replace(/\n/g, '\\n')));
  }
};

const CAMPOS_IA = ['titulo', 'tipo', 'prioridad', 'criticidad', 'cliente_id', 'proyecto', 'manager_id', 'pais', 'sponsor', 'descripcion', 'beneficio', 'tecnologias',
  'cuenta_cargo', 'importe', 'esfuerzo_estimado', 'fecha_inicio', 'fecha_fin', 'notas'];
const ESQUEMA_DEMANDA = {
  type: 'object',
  properties: { ...Object.fromEntries(CAMPOS_IA.map((k) => [k, { type: 'string' }])), agencias: { type: 'array', items: { type: 'string' } },
    lineas: { type: 'array', items: { type: 'object', properties: { persona_id: { type: 'string' }, agencia_id: { type: 'string' }, funcion: { type: 'string' } },
      required: ['persona_id', 'agencia_id', 'funcion'], additionalProperties: false } } },
  required: [...CAMPOS_IA, 'agencias', 'lineas'],
  additionalProperties: false,
};
async function demandaIA(db, env, body) {
  const texto = String(body.texto || '').trim();
  if (texto.length < 20) return err('Paste, dictate or upload a bit more first');
  const c = await catalogos(db, 'builder');
  const hoy = new Date().toISOString().slice(0, 10);
  const system = `You help a cross-cutting AI innovation team at a consulting firm (NTT DATA, Quality Engineering) register new requests: PoCs of an AI agency, implementations, research, demos, agency showcases, improvements, support to a team that builds something, trainings, adoption advisory, talks or the newsletter.
You receive a voice-note transcription, meeting notes or an email. Extract the demand and reply ONLY with a JSON object with these keys (all strings except "agencias"; use "" when the text does not say it, never invent):
- titulo: short title (max 80 chars), in the input language.
- tipo: one of ${TIPOS.join(', ')} (poc = proof of concept of an agency; implementacion = roll-out at a client; investigacion = researching a technology; demo = preparing a demo; ensenar_agencia = showing an existing agency; mejora = improving an existing capability; soporte = helping a team that is building something on its own; formacion = a training (e.g. GitHub Copilot); asesoria = advising projects on AI adoption; charla = a talk; boletin = the newsletter).
- prioridad: one of ${PRIORIDADES.join(', ')} or "".
- criticidad: one of ${CRITICIDADES.join(', ')} or "".
- cliente_id: the id of the client from the CLIENTS list below that the text refers to, or "" if none or unsure.
- proyecto: project name inside that client, if mentioned.
- manager_id: id from the MANAGERS list if the responsible manager is mentioned, else "".
- sponsor: person or area sponsoring it at the client, if mentioned.
- descripcion: 2-6 sentences with what is asked, scope and context.
- beneficio: expected benefit or value, if mentioned.
- tecnologias: comma-separated technologies or tools mentioned.
- cuenta_cargo: charge account / cost centre code, if mentioned.
- importe: amount in euros as digits only (e.g. "220000"), if mentioned.
- esfuerzo_estimado: estimated effort in person-days as digits, if mentioned (convert weeks x5, months x20).
- fecha_inicio, fecha_fin: YYYY-MM-DD if dates are mentioned (today is ${hoy}; resolve relative dates).
- pais: country if the request does not come from Spain (one of ${PAISES.join(', ')}), else "".
- notas: anything else useful (people to inform, risks, open questions).
- agencias: ids from the AGENCIES list that the demand would use or show, or [].
- lineas: who will do what, if said: [{persona_id from TEAM, agencia_id from AGENCIES or "", funcion: what that person does}], else [].
CLIENTS (id|name|client family|sector):
${c.clientes.filter((x) => x.activo).map((x) => `${x.id}|${x.nombre}|${x.client_family || ''}|${x.sector || ''}`).join('\n')}
AGENCIES (id|name):
${c.agencias.filter((x) => x.activo).map((x) => `${x.id}|${x.nombre}`).join('\n')}
MANAGERS (id|name):
${c.contactos.filter((x) => x.activo && x.es_manager).map((x) => `${x.id}|${x.nombre}`).join('\n') || '(none yet)'}
TEAM (id|name|role):
${c.personas.filter((x) => x.activo).map((x) => `${x.id}|${x.nombre}|${x.funcion || x.rol || ''}`).join('\n')}`;
  const r = jsonDe(await llamaIA(env, { system, content: `<text>\n${texto.slice(0, 40000)}\n</text>`, schema: ESQUEMA_DEMANDA, max_tokens: 3000 }));
  const out = {};
  for (const k of CAMPOS_IA) out[k] = r[k] == null ? '' : String(r[k]).trim();
  if (!TIPOS.includes(out.tipo)) out.tipo = '';
  if (!PRIORIDADES.includes(out.prioridad)) out.prioridad = '';
  if (!CRITICIDADES.includes(out.criticidad)) out.criticidad = '';
  out.cliente_id = c.clientes.some((x) => String(x.id) === out.cliente_id) ? Number(out.cliente_id) : '';
  out.manager_id = c.contactos.some((x) => String(x.id) === out.manager_id && x.es_manager) ? Number(out.manager_id) : '';
  out.proyecto_id = '';
  if (out.cliente_id && out.proyecto) {
    const p = c.proyectos.find((x) => x.cliente_id === out.cliente_id && x.nombre.toLowerCase() === out.proyecto.toLowerCase());
    if (p) out.proyecto_id = p.id;
  }
  for (const k of ['importe', 'esfuerzo_estimado']) out[k] = /^\d+(\.\d+)?$/.test(out[k].replace(/[.\s](?=\d{3}\b)/g, '').replace(',', '.')) ? Number(out[k].replace(/[.\s](?=\d{3}\b)/g, '').replace(',', '.')) : '';
  for (const k of ['fecha_inicio', 'fecha_fin']) if (!/^\d{4}-\d{2}-\d{2}$/.test(out[k])) out[k] = '';
  out.agencias = (Array.isArray(r.agencias) ? r.agencias : []).map(String).filter((a) => c.agencias.some((x) => x.id === a));
  if (!c.paises.includes(out.pais) || out.pais === 'España') out.pais = '';
  out.lineas = (Array.isArray(r.lineas) ? r.lineas : []).map((l) => ({ persona_id: Number(l.persona_id), agencia_id: c.agencias.some((x) => x.id === l.agencia_id) ? l.agencia_id : '', funcion: String(l.funcion || '').slice(0, 400) }))
    .filter((l) => c.personas.some((x) => x.id === l.persona_id));
  for (const l of out.lineas) if (l.agencia_id && !out.agencias.includes(l.agencia_id)) out.agencias.push(l.agencia_id);
  return json(out);
}

async function transcribir(env, body) {
  if (!env.AI) return err('Audio transcription is not set up (Workers AI binding missing)', 503);
  const audio = String(body.audio || '').replace(/^data:[^,]*,/, '');
  if (!audio) return err('No audio received');
  if (audio.length > 34_000_000) return err('Audio too long: keep it under 25 MB (about 25 minutes)');
  const opts = { audio, task: 'transcribe', vad_filter: true };
  if (['es', 'en'].includes(body.idioma)) opts.language = body.idioma;
  const r = await env.AI.run('@cf/openai/whisper-large-v3-turbo', opts);
  return json({ texto: String(r?.text || '').trim() });
}

async function compruebaCuota(db, user) {
  const aj = await leeAjustes(db);
  const r = await db.prepare(`SELECT SUM(CASE WHEN usuario = ?1 AND fecha >= date('now') THEN 1 ELSE 0 END) AS yo_dia, COUNT(*) AS total_mes
    FROM uso_ia WHERE fecha >= date('now', 'start of month')`).bind(user).first();
  const e = (msg) => { const x = new Error(msg); x.status = 429; return x; };
  if (!aj.ia_activa) throw e('The AI assistant is switched off by the administrator (Settings)');
  if (aj.ia_usuario_dia && (r?.yo_dia || 0) >= aj.ia_usuario_dia) throw e(`You have used your ${aj.ia_usuario_dia} AI uses for today. You can still fill in the form by hand`);
  if (aj.ia_total_mes && (r?.total_mes || 0) >= aj.ia_total_mes) throw e(`The team has reached this month's AI limit (${aj.ia_total_mes} uses)`);
  return { aj, yo_dia: r?.yo_dia || 0 };
}

async function rutaIA(db, env, m, id, body, user) {
  if (m === 'GET' && id === 'estado') {
    const aj = await leeAjustes(db);
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM uso_ia WHERE usuario = ? AND fecha >= date('now')`).bind(user).first();
    const prov = proveedorIA(env);
    return json({ texto: !!prov && !!aj.ia_activa, audio: !!env.AI && !!aj.ia_activa, activa: !!aj.ia_activa, proveedor: prov, quedan: aj.ia_usuario_dia ? Math.max(0, aj.ia_usuario_dia - (r?.n || 0)) : null });
  }
  if (m !== 'POST') return err('Route not found', 404);
  try {
    await compruebaCuota(db, user);
    let r;
    if (id === 'transcribir') r = await transcribir(env, body);
    else if (id === 'demanda') r = await demandaIA(db, env, body);
    else return err('Route not found', 404);
    if (r.ok) await db.prepare('INSERT INTO uso_ia (usuario, tipo) VALUES (?, ?)').bind(user, id).run();
    return r;
  } catch (e) { return err(e.message, e.status || 500); }
}

// ---------- Login propio (como Charlize) ----------
// El primer administrador (ADMIN_EMAIL) entra con su email y 1111 y debe cambiarla. Al resto se le invita con un enlace o se le da acceso con 1111.
const PASS_INICIAL = '1111';
const DIAS_SESION = 30;
const ITER = 20000;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPass(pass, saltHex) {
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256));
}
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const nuevoSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const nuevoToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const cookieSesion = (token, maxAge) => `sesion_nicole=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const tokenCookie = (request) => (request.headers.get('Cookie') || '').match(/(?:^|;\s*)sesion_nicole=([a-f0-9]{64})/)?.[1];

async function asegurarAdmin(db, env) {
  const admins = String(env.ADMIN_EMAIL || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
  for (const email of admins) {
    if (await db.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(email).first()) continue;
    const salt = nuevoSalt();
    await db.prepare(`INSERT INTO usuarios (email, hash, salt, rol) VALUES (?,?,?, 'admin')`).bind(email, await hashPass(PASS_INICIAL, salt), salt).run();
  }
}
async function login(db, body) {
  const id = String(body.login || '').trim().toLowerCase();
  const u = await db.prepare('SELECT * FROM usuarios WHERE email = ? OR lower(usuario) = ?').bind(id, id).first();
  if (!u) return err('Incorrect username or password', 401);
  if (u.bloqueado_hasta && u.bloqueado_hasta > new Date().toISOString()) return err('Too many attempts. Wait 15 minutes or ask the admin to reset your password.', 429);
  if ((await hashPass(String(body.password || ''), u.salt)) !== u.hash) {
    const n = u.intentos + 1;
    await db.prepare('UPDATE usuarios SET intentos = ?, bloqueado_hasta = ? WHERE email = ?')
      .bind(n >= 5 ? 0 : n, n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null, u.email).run();
    return err('Incorrect username or password', 401);
  }
  const token = nuevoToken();
  await db.prepare(`INSERT INTO sesiones (token, email, expira) VALUES (?, ?, datetime('now', '+${DIAS_SESION} days'))`).bind(token, u.email).run();
  await db.prepare(`UPDATE usuarios SET intentos = 0, bloqueado_hasta = NULL, ultimo_acceso = datetime('now') WHERE email = ?`).bind(u.email).run();
  await db.prepare(`DELETE FROM sesiones WHERE expira < datetime('now')`).run();
  return new Response(JSON.stringify({ ok: true, debe_cambiar: !!u.debe_cambiar }), { headers: { 'content-type': 'application/json', 'set-cookie': cookieSesion(token, DIAS_SESION * 86400) } });
}
async function cambiarPassword(db, u, body) {
  const nueva = String(body.nueva || '');
  if (nueva.length < 4) return err('Password must be at least 4 characters');
  if (nueva === PASS_INICIAL) return err('Choose a password different from the initial one');
  if (!u.debe_cambiar && (await hashPass(String(body.actual || ''), u.salt)) !== u.hash) return err('The current password is incorrect', 401);
  const usuario = String(body.usuario ?? u.usuario ?? '').trim();
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) return err('Username must be 3-30 letters, numbers, dots or dashes');
  if (await db.prepare('SELECT 1 FROM usuarios WHERE lower(usuario) = ? AND email != ?').bind(usuario.toLowerCase(), u.email).first()) return err('That username is taken');
  const salt = nuevoSalt();
  await db.prepare('UPDATE usuarios SET usuario = ?, nombre = COALESCE(?, nombre), hash = ?, salt = ?, debe_cambiar = 0 WHERE email = ?')
    .bind(usuario, txt(body.nombre, 120), await hashPass(nueva, salt), salt, u.email).run();
  return json({ ok: true });
}
const EMAIL_NTT = /^[^@\s]+@([a-z0-9-]+\.)*nttdata\.com$/i;
async function registro(db, body) {
  const inv = await db.prepare(`SELECT * FROM invitaciones WHERE token = ? AND usado_por IS NULL AND expira > datetime('now')`).bind(String(body.token || '')).first();
  if (!inv) return err('This invite link has expired or was already used. Ask for a new one.', 410);
  const email = String(body.email || '').trim().toLowerCase();
  const usuario = String(body.usuario || '').trim();
  const pass = String(body.password || '');
  if (!EMAIL_NTT.test(email)) return err('Use your NTT DATA email address');
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(usuario)) return err('Username: 3-30 characters, letters, numbers, dot, dash or underscore');
  if (pass.length < 4) return err('Password must be at least 4 characters');
  if (await db.prepare('SELECT 1 FROM usuarios WHERE email = ?').bind(email).first()) return err('That email already has an account. Sign in instead.', 409);
  if (await db.prepare('SELECT 1 FROM usuarios WHERE lower(usuario) = lower(?)').bind(usuario).first()) return err('That username is taken', 409);
  const salt = nuevoSalt();
  await db.prepare('INSERT INTO usuarios (email, usuario, nombre, rol, hash, salt, debe_cambiar) VALUES (?,?,?,?,?,?,0)')
    .bind(email, usuario, txt(body.nombre, 120), ROLES.includes(inv.rol) ? inv.rol : 'builder', await hashPass(pass, salt), salt).run();
  await db.prepare('UPDATE invitaciones SET usado_por = ? WHERE token = ?').bind(email, inv.token).run();
  await log(db, 'usuario', email, 'alta', `Account created with invite from ${inv.creado_por} (role ${inv.rol})`, email);
  return login(db, { login: email, password: pass });
}
async function gestionUsuarios(db, m, id, sub, body, actor) {
  if (m === 'GET') return json((await db.prepare('SELECT email, usuario, nombre, rol, debe_cambiar, ultimo_acceso, creado FROM usuarios ORDER BY email').all()).results);
  if (m === 'POST' && !id) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Invalid email');
    const rol = ROLES.includes(body.rol) ? body.rol : 'builder';
    const salt = nuevoSalt();
    const r = await db.prepare('INSERT INTO usuarios (email, rol, hash, salt) VALUES (?,?,?,?) ON CONFLICT DO NOTHING RETURNING email').bind(email, rol, await hashPass(PASS_INICIAL, salt), salt).first();
    if (!r) return err('That email already has access', 409);
    await log(db, 'usuario', email, 'alta', `Role ${rol} · initial password 1111`, actor);
    return json({ ok: true }, 201);
  }
  if (m === 'PUT' && id) {
    if (!ROLES.includes(body.rol)) return err('Unknown role');
    if (id === actor && body.rol !== 'admin') return err('You cannot remove your own admin role');
    await db.prepare('UPDATE usuarios SET rol = ? WHERE email = ?').bind(body.rol, id).run();
    await log(db, 'usuario', id, 'rol', body.rol, actor);
    return json({ ok: true });
  }
  if (m === 'POST' && sub === 'reset') {
    const salt = nuevoSalt();
    await db.prepare('UPDATE usuarios SET hash = ?, salt = ?, debe_cambiar = 1, intentos = 0, bloqueado_hasta = NULL WHERE email = ?').bind(await hashPass(PASS_INICIAL, salt), salt, id).run();
    await db.prepare('DELETE FROM sesiones WHERE email = ?').bind(id).run();
    await log(db, 'usuario', id, 'reset', 'Password reset to 1111', actor);
    return json({ ok: true });
  }
  if (m === 'DELETE' && id) {
    if (id === actor) return err('You cannot remove your own access');
    await db.batch([db.prepare('DELETE FROM sesiones WHERE email = ?').bind(id), db.prepare('DELETE FROM usuarios WHERE email = ?').bind(id)]);
    await log(db, 'usuario', id, 'baja', null, actor);
    return json({ ok: true });
  }
  return err('Route not found', 404);
}

async function backup(db) {
  const out = { app: 'nicole', version: APP_VERSION, fecha: new Date().toISOString() };
  for (const t of ['demandas', 'demanda_agencias', 'demanda_personas', 'demanda_contactos', 'clientes', 'proyectos', 'agencias', 'personas', 'contactos', 'eventos', 'avisos']) {
    out[t] = (await db.prepare(`SELECT * FROM ${t}`).all()).results;
  }
  out.adjuntos = (await db.prepare('SELECT id, demanda_id, nombre, tipo_doc, mime, tamano, clave_r2, subido_por, fecha FROM adjuntos').all()).results;
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="nicole-backup-${out.fecha.slice(0, 10)}.json"` } });
}

// ---------- Router ----------
export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return err('Database not configured (DB binding)', 500);
  const url = new URL(request.url);
  const [res, id, sub] = (params.path || []).map(decodeURIComponent);
  const m = request.method;
  if (res === 'version') return json({ version: APP_VERSION });
  await ensureSchema(db);
  await asegurarAdmin(db, env);
  const body = ['POST', 'PUT'].includes(m) ? await request.json().catch(() => ({})) : {};

  if (res === 'login' && m === 'POST') return login(db, body);
  if (res === 'invitacion' && m === 'GET') return json({ valida: !!(await db.prepare(`SELECT 1 FROM invitaciones WHERE token = ? AND usado_por IS NULL AND expira > datetime('now')`).bind(String(id || '')).first()) });
  if (res === 'registro' && m === 'POST') return registro(db, body);
  if (res === 'logout' && m === 'POST') {
    const t = tokenCookie(request);
    if (t) await db.prepare('DELETE FROM sesiones WHERE token = ?').bind(t).run();
    return new Response('{"ok":true}', { headers: { 'content-type': 'application/json', 'set-cookie': cookieSesion('', 0) } });
  }
  const t = tokenCookie(request);
  let cuenta = t ? await db.prepare(`SELECT u.* FROM sesiones s JOIN usuarios u ON u.email = s.email WHERE s.token = ? AND s.expira > datetime('now')`).bind(t).first() : null;
  // Acceso por API (para dar de alta requests desde Claude): Authorization: Bearer <token generado por el admin en Settings>. Actúa con rol director.
  const bearer = (request.headers.get('Authorization') || '').match(/^Bearer\s+([a-f0-9]{48})$/i)?.[1];
  if (!cuenta && bearer) {
    const h = await db.prepare(`SELECT valor FROM ajustes WHERE clave = 'api_token_hash'`).first();
    if (h?.valor && h.valor === (await sha256(bearer.toLowerCase()))) cuenta = { email: 'api', usuario: 'api', nombre: 'API (Claude)', rol: 'director', debe_cambiar: 0, preferencias: '{}' };
  }
  if (!cuenta) return err('Not authenticated', 401);
  const user = cuenta.email;
  const rol = ROLES.includes(cuenta.rol) ? cuenta.rol : 'builder';
  const isAdmin = rol === 'admin';
  let prefs = {};
  try { prefs = JSON.parse(cuenta.preferencias || '{}') || {}; } catch {}
  if (res === 'me') return json({ email: user, usuario: cuenta.usuario, nombre: cuenta.nombre, rol, admin: isAdmin, debe_cambiar: !!cuenta.debe_cambiar, preferencias: prefs,
    permisos: Object.fromEntries(Object.keys(PERMISOS).map((k) => [k, puede(rol, k)])) });
  if (res === 'password' && m === 'POST') return cambiarPassword(db, cuenta, body);
  if (cuenta.debe_cambiar) return err('You must change your password before continuing', 403);

  try {
    if (res === 'preferencias' && m === 'PUT') {
      const clave = String(body.clave || '');
      if (!/^[a-zA-Z][\w.-]{0,40}$/.test(clave)) return err('Invalid preference key');
      if (body.valor === null || body.valor === undefined) delete prefs[clave]; else prefs[clave] = body.valor;
      const s = JSON.stringify(prefs);
      if (s.length > 60000) return err('Too many preferences saved', 413);
      await db.prepare('UPDATE usuarios SET preferencias = ? WHERE email = ?').bind(s, user).run();
      return json({ ok: true });
    }
    if (res === 'catalogos' && m === 'GET') return json(await catalogos(db, rol));
    if (res === 'demandas') {
      if (m === 'GET' && !id) return listDemandas(db, url, rol);
      if (m === 'POST' && !id) return createDemanda(db, body, user, rol);
      if (m === 'POST' && sub === 'adjuntos') return subeAdjunto(db, env, Number(id), body, user);
      if (m === 'GET') return getDemanda(db, Number(id), rol);
      if (m === 'PUT') return updateDemanda(db, Number(id), body, user, rol);
      if (m === 'DELETE') {
        if (!isAdmin) return err('Only the admin can delete demands', 403);
        const d = await db.prepare('SELECT titulo FROM demandas WHERE id = ?').bind(Number(id)).first();
        if (!d) return err('Demand not found', 404);
        const adj = (await db.prepare('SELECT clave_r2 FROM adjuntos WHERE demanda_id = ? AND clave_r2 IS NOT NULL').bind(Number(id)).all()).results;
        if (env.ADJUNTOS) for (const a of adj) await env.ADJUNTOS.delete(a.clave_r2);
        await db.batch(['demanda_agencias', 'demanda_personas', 'demanda_contactos', 'adjuntos', 'avisos'].map((tb) => db.prepare(`DELETE FROM ${tb} WHERE demanda_id = ?`).bind(Number(id)))
          .concat(db.prepare('DELETE FROM demandas WHERE id = ?').bind(Number(id))));
        await log(db, 'demanda', id, 'borrada', `“${d.titulo}”`, user);
        return json({ ok: true });
      }
    }
    if (res === 'lineas' && id && m === 'PUT') return estimaLinea(db, Number(id), body, user, rol);
    if (res === 'avisos') {
      if (m === 'GET') {
        const avisos = (await db.prepare(`SELECT a.*, d.titulo FROM avisos a LEFT JOIN demandas d ON d.id = a.demanda_id WHERE a.email = ? ORDER BY a.fecha DESC, a.id DESC LIMIT 60`).bind(user).all()).results;
        const pendientes = (await db.prepare(`SELECT dp.id, dp.demanda_id, dp.agencia_id, dp.funcion, d.titulo, d.prioridad, d.estado FROM demanda_personas dp JOIN personas p ON p.id = dp.persona_id
          JOIN demandas d ON d.id = dp.demanda_id WHERE lower(p.email) = ? AND dp.estimado = 0 AND d.archivada = 0 AND d.estado <> 'done' ORDER BY d.creado`).bind(user).all()).results;
        return json({ avisos, pendientes, sin_leer: avisos.filter((a) => !a.leido).length });
      }
      if (m === 'POST' && id === 'leer') { await db.prepare('UPDATE avisos SET leido = 1 WHERE email = ?').bind(user).run(); return json({ ok: true }); }
    }
    if (res === 'token' && isAdmin) {
      if (m === 'POST') {
        const tk = hex(crypto.getRandomValues(new Uint8Array(24)));
        await db.prepare(`INSERT INTO ajustes (clave, valor) VALUES ('api_token_hash', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`).bind(await sha256(tk)).run();
        await log(db, 'ajustes', 'api_token', 'editada', 'New API token created (the previous one stops working)', user);
        return json({ token: tk }, 201);
      }
      if (m === 'DELETE') { await db.prepare(`DELETE FROM ajustes WHERE clave = 'api_token_hash'`).run(); await log(db, 'ajustes', 'api_token', 'editada', 'API token revoked', user); return json({ ok: true }); }
    }
    if (res === 'adjuntos' && id) {
      if (m === 'GET') return bajaAdjunto(db, env, Number(id));
      if (m === 'DELETE') return borraAdjunto(db, env, Number(id), user);
    }
    if (MAESTROS[res] && ['POST', 'PUT'].includes(m)) return maestro(db, res, m, id, body, user, rol);
    if (res === 'ia') return rutaIA(db, env, m, id, body, user);
    if (res === 'eventos' && m === 'GET') {
      const { results } = await db.prepare(`SELECT e.*, COALESCE(u.usuario, e.usuario) AS quien FROM eventos e LEFT JOIN usuarios u ON u.email = e.usuario ORDER BY e.fecha DESC, e.id DESC LIMIT 300`).all();
      return json(results);
    }
    if (res === 'ajustes') {
      if (!isAdmin) return err('Only the admin can see and change the settings', 403);
      if (m === 'GET') return json({ ...(await leeAjustes(db)), reglas_prioridad: await leeReglas(db), r2: !!env.ADJUNTOS, ia: proveedorIA(env),
        api_token: !!(await db.prepare(`SELECT 1 FROM ajustes WHERE clave = 'api_token_hash'`).first()) });
      if (m === 'PUT') return guardaAjustes(db, body, user);
    }
    if (res === 'usuarios') {
      if (!isAdmin) return err('Only the admin can manage users', 403);
      return gestionUsuarios(db, m, id, sub, body, user);
    }
    if (res === 'invitaciones' && m === 'POST') {
      if (!isAdmin) return err('Only the admin can invite people', 403);
      const token = nuevoToken().slice(0, 32);
      const r = ROLES.includes(body.rol) ? body.rol : 'builder';
      await db.prepare(`INSERT INTO invitaciones (token, rol, creado_por, expira) VALUES (?, ?, ?, datetime('now', '+7 days'))`).bind(token, r, user).run();
      await log(db, 'usuario', user, 'invitacion', `Invite link created (role ${r})`, user);
      return json({ token, expira_dias: 7 }, 201);
    }
    if (res === 'personas-app' && m === 'GET') {
      // Usuarios con cuenta, para enlazarlos con su ficha de persona
      return json((await db.prepare('SELECT email, usuario, nombre, rol FROM usuarios ORDER BY usuario').all()).results);
    }
    if (res === 'backup' && m === 'GET') {
      if (!isAdmin) return err('Only the admin can download a backup', 403);
      return backup(db);
    }
    return err('Route not found', 404);
  } catch (e) {
    return e.status ? err(e.message, e.status) : err(`Internal error: ${e.message}`, 500);
  }
}

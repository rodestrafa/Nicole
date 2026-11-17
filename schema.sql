-- Nicole · esquema de la base de datos (Cloudflare D1 / SQLite)
-- La API también crea estas tablas al arrancar si faltan (functions/api/[[path]].js, ensureSchema),
-- así que aplicar este fichero es opcional. Nunca borra datos.

-- ---------- Acceso ----------
CREATE TABLE IF NOT EXISTS usuarios (
  email TEXT PRIMARY KEY,
  usuario TEXT UNIQUE,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'builder',            -- admin | principal_director | director | architect | pm | builder
  hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  debe_cambiar INTEGER NOT NULL DEFAULT 1,
  intentos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TEXT,
  ultimo_acceso TEXT,
  preferencias TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expira TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invitaciones (
  token TEXT PRIMARY KEY,
  rol TEXT NOT NULL DEFAULT 'builder',
  creado_por TEXT NOT NULL,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  expira TEXT NOT NULL,
  usado_por TEXT
);

-- ---------- Maestros ----------
-- Clientes del QS Budget FY27 (sector > client family > cliente) más los que se den de alta en la app
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  codigo TEXT,                                    -- código de cliente NTT (p. ej. 301962)
  sector TEXT,
  client_family TEXT,
  pais TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  origen TEXT DEFAULT 'app',                      -- budget | app
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(nombre, codigo)
);
CREATE TABLE IF NOT EXISTS proyectos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  nombre TEXT NOT NULL,
  codigo TEXT,                                    -- EXT / código de proyecto, si lo hay
  cuenta_cargo TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(cliente_id, nombre)
);
-- Agencias de IA del QS AI Offering
CREATE TABLE IF NOT EXISTS agencias (
  id TEXT PRIMARY KEY,                            -- slug, p. ej. master-test-plan
  nombre TEXT NOT NULL,
  dominio TEXT,                                   -- Test Management | Engineering | Enablement | Optimization
  madurez TEXT,                                   -- concepto | construccion | beta | productiva
  resumen TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Personas del equipo de innovación (quién trabaja en cada demanda). Pueden tener o no cuenta en la app.
CREATE TABLE IF NOT EXISTS personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  rol TEXT,                                       -- mismo catálogo que usuarios.rol
  funcion TEXT,                                   -- p. ej. CoE lead
  tarifa_dia REAL,                                -- €/día; vacío = tarifa del rol (ajustes)
  capacidad INTEGER NOT NULL DEFAULT 100,         -- % de su jornada disponible para innovación
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Contactos: managers responsables, gente de sector, AS y otros
CREATE TABLE IF NOT EXISTS contactos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT,
  area TEXT,                                      -- Manager | Sector | AS | Cliente | Otro
  es_manager INTEGER NOT NULL DEFAULT 0,          -- aparece en «Manager responsable»
  activo INTEGER NOT NULL DEFAULT 1,
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Demandas ----------
CREATE TABLE IF NOT EXISTS demandas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'poc',               -- poc | implementacion | investigacion | demo | ensenar_agencia | mejora | soporte | formacion | asesoria | charla | boletin
  estado TEXT NOT NULL DEFAULT 'new',             -- new | assigned (pendiente de estimar) | planned | progress | done
  prioridad TEXT DEFAULT 'Media',                 -- Crítica | Alta | Media | Baja
  criticidad TEXT,                                -- Alta | Media | Baja
  cliente_id INTEGER REFERENCES clientes(id),
  proyecto_id INTEGER REFERENCES proyectos(id),
  manager_id INTEGER REFERENCES contactos(id),
  pais TEXT,                                      -- país de la request si no es el del cliente
  sponsor TEXT,
  descripcion TEXT,
  beneficio TEXT,
  tecnologias TEXT,                               -- separadas por comas
  cuenta_cargo TEXT,
  importe REAL,                                   -- valor de la oportunidad para el cliente, si lo hay (€)
  esfuerzo_estimado REAL,                         -- jornadas totales estimadas (si no se reparte por persona)
  fecha_solicitud TEXT,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  notas TEXT,
  archivada INTEGER NOT NULL DEFAULT 0,
  creado TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  creado_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_dem_estado ON demandas(estado, archivada);
CREATE TABLE IF NOT EXISTS demanda_agencias (
  demanda_id INTEGER NOT NULL,
  agencia_id TEXT NOT NULL,
  PRIMARY KEY (demanda_id, agencia_id)
);
-- Líneas: qué agencia o trabajo hace cada persona dentro de la request, con su estimación (base del coste, la capacidad y el Gantt por persona)
CREATE TABLE IF NOT EXISTS demanda_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL,
  persona_id INTEGER NOT NULL,
  agencia_id TEXT,                                -- agencia que monta (vacío = trabajo general)
  funcion TEXT,                                   -- qué hace (texto libre)
  jornadas REAL,                                  -- esfuerzo estimado
  dedicacion INTEGER,                             -- % mientras dura (si no, se calcula de las jornadas)
  inicio TEXT,                                    -- fechas propias de la línea (si no, las de la request)
  fin TEXT,
  estimado INTEGER NOT NULL DEFAULT 0,            -- 1 cuando tiene jornadas
  creado TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dp_dem ON demanda_personas(demanda_id);
-- Avisos en la app (asignaciones y cambios de estado) para cada usuario
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  demanda_id INTEGER,
  texto TEXT NOT NULL,
  leido INTEGER NOT NULL DEFAULT 0,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_avisos ON avisos(email, leido);
-- Personas a informar y otros contactos
CREATE TABLE IF NOT EXISTS demanda_contactos (
  demanda_id INTEGER NOT NULL,
  contacto_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'informar',          -- informar | otro
  PRIMARY KEY (demanda_id, contacto_id, tipo)
);
-- Adjuntos: el fichero va a R2 (binding ADJUNTOS); si no hay R2, los pequeños se guardan aquí en base64
CREATE TABLE IF NOT EXISTS adjuntos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  demanda_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo_doc TEXT,                                  -- Presentación | Estimación | Diseño técnico | Alcance | Otro
  mime TEXT,
  tamano INTEGER,
  clave_r2 TEXT,
  datos TEXT,
  subido_por TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_adj_dem ON adjuntos(demanda_id);

-- ---------- Registro y ajustes ----------
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entidad TEXT NOT NULL,
  entidad_id TEXT NOT NULL,
  accion TEXT NOT NULL,
  detalle TEXT,
  usuario TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evt ON eventos(entidad, entidad_id);
CREATE TABLE IF NOT EXISTS ajustes (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
CREATE TABLE IF NOT EXISTS uso_ia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario TEXT NOT NULL,
  tipo TEXT NOT NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

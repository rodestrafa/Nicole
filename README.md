# Nicole

Gestión de la demanda del equipo de innovación transversal (adopción de IA): PoCs de agencias, implantaciones, investigación, demos, enseñar agencias, mejoras, soporte a equipos, formaciones, asesoría de adopción, charlas y boletín.

Mismo frontal y estilos que Charlize, pero proyecto aparte: repo, Cloudflare Pages, base de datos D1 y usuarios propios.

## Qué hace

- **Requests** con cliente/account (93 clientes del QS Budget FY27 + los que se den de alta), proyecto, país, sector, client family, manager responsable, sponsor, cuenta de cargo, personas a informar y otros contactos.
- **Líneas** dentro de cada request: una por agencia o trabajo, con la persona que lo hace, días, dedicación y fechas. Al asignar, la persona recibe un aviso en su Home y estima su línea.
- **Estados:** New → Assigned (pendiente de estimar) → Planned (todo estimado, automático) → In progress → Done. Descartar = archivar.
- **Prioridad sugerida por cliente** con reglas editables en Settings (BBVA y Sabadell primero, banca/seguros/utilities alta, industria y telco media, Local Business, IO y otros países baja).
- **Kanban, lista, Gantt por persona o por request, capacidad mensual** y **vistas favoritas** (filtros guardados, una por defecto por página, accesos en el menú).
- **Coste** = días × tarifa de la persona o de su rol (las tarifas solo las ve el admin).
- **Alta desde audio o notas con IA** (Whisper + modelo de Workers AI, o Claude Haiku si hay `ANTHROPIC_API_KEY`), y **API con clave** para que Claude registre requests desde una conversación.
- **Adjuntos** (presentaciones, estimaciones, diseños técnicos, alcances) en R2, o en D1 hasta 1,5 MB si R2 no está activado.

## Estructura

- `public/`: frontal (Preact + htm sin compilación). `js/app.js` shell, `js/demandas.js` requests y vistas, `js/admin.js` listas y administración.
- `functions/api/[[path]].js`: API única (Pages Functions). Crea las tablas y carga los maestros en el primer acceso.
- `functions/api/_maestros.js`: clientes del budget, agencias del QS AI Offering, equipo, países, sectores y reglas de prioridad iniciales.
- `schema.sql`: documentación del esquema (la API lo aplica sola).

## Desplegar

Ver [GUIA_DESPLIEGUE.md](GUIA_DESPLIEGUE.md). En corto: `./scripts/desplegar.sh` desde un Mac con Node y sesión de Cloudflare.

## API para Claude

Settings › API key for Claude genera una clave (se muestra una vez). Con `Authorization: Bearer <clave>`:

- `GET /api/catalogos`: clientes, agencias, equipo, managers (ids).
- `POST /api/demandas`: `{ titulo, tipo, cliente_id, pais, descripcion, agencias: [...], personas: [{ persona_id, agencia_id, funcion }], origen_api: 1 }`.

Actúa con rol Director.

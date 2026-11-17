# Guía de despliegue de Nicole

Requisitos (una vez): Mac con Node.js LTS, este repo clonado y una cuenta de Cloudflare (la misma que Charlize sirve).

```bash
cd Nicole
./scripts/desplegar.sh
```

El script, que se puede repetir:

1. Comprueba la sesión de Cloudflare (abre el navegador la primera vez: «Allow»).
2. Crea la base de datos D1 `nicole` si no existe; si existe, guarda una copia JSON de cada tabla en `../copias-seguridad/nicole-AAAAMMDD-HHMM`.
3. Crea el bucket R2 `nicole-adjuntos`. Si R2 no está activado en la cuenta, sigue sin él (adjuntos en D1 hasta 1,5 MB). Para activarlo: panel de Cloudflare › R2 › Enable.
4. Pone el id de la base de datos y el email del admin en `wrangler.toml`.
5. Crea el proyecto de Pages `nicole` si no existe.
6. Publica `public/` y la API.

No hace falta subir ficheros SQL (Zscaler lo bloquea): la app crea las tablas y carga clientes, agencias y equipo en el primer acceso.

## Después del primer despliegue

1. Entra en la URL con `rodestrafa@gmail.com` y la contraseña `1111`; elige usuario y contraseña.
2. Users: da acceso a cada persona con su rol (o invítala con un enlace).
3. Lists › Team: enlaza a cada persona con el email de su usuario y pon su tarifa (o la del rol en Settings).
4. Lists › Managers and contacts: carga los managers responsables.
5. Settings: revisa las reglas de prioridad y, si quieres que Claude registre requests, crea la API key.

IA: funciona con Workers AI de la cuenta (gratis dentro del cupo diario). Para usar Claude Haiku, añade el secreto `ANTHROPIC_API_KEY` en el proyecto de Pages.

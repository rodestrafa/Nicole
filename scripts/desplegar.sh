#!/usr/bin/env bash
# Despliega (o actualiza) Nicole en tu cuenta de Cloudflare. Se puede ejecutar tantas veces como quieras.
# Uso:  ./scripts/desplegar.sh            (pide el email del administrador la primera vez)
# El administrador entra con su email y 1111; invita al resto desde Users o con el botón de invitar.
set -euo pipefail
cd "$(dirname "$0")/.."

PROYECTO="nicole"
BD="nicole"
BUCKET="nicole-adjuntos"
W="npx --yes wrangler@4"

command -v node >/dev/null || { echo "Falta Node.js: instálalo desde https://nodejs.org (versión LTS) y vuelve a ejecutar."; exit 1; }
ADMIN_EMAIL="${ADMIN_EMAIL:-$(node -e "const t=require('fs').readFileSync('wrangler.toml','utf8');process.stdout.write((t.match(/^ADMIN_EMAIL = \"(.*)\"/m)||[])[1]||'')")}"
[ -n "$ADMIN_EMAIL" ] || read -rp "Email del administrador: " ADMIN_EMAIL

echo "1/6 · Comprobando sesión de Cloudflare…"
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then echo "    Usando token de API."
elif ! $W whoami 2>/dev/null | grep -qi "associated with the email"; then
  echo "    Se abrirá el navegador: pulsa «Allow» para autorizar."
  $W login
fi

echo "2/6 · Base de datos…"
DB_ID=$($W d1 list --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const l=JSON.parse(s);const d=l.find(x=>x.name==='$BD');process.stdout.write(d?d.uuid:'')}catch{}})")
if [ -z "$DB_ID" ]; then
  $W d1 create "$BD" >/dev/null
  DB_ID=$($W d1 list --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const l=JSON.parse(s);process.stdout.write(l.find(x=>x.name==='$BD').uuid)})")
  echo "    Creada ($DB_ID). Las tablas, los 93 clientes del budget, las 20 agencias y el equipo se crean solos en el primer acceso."
else
  echo "    Ya existe ($DB_ID)"
  echo "    Copia de seguridad de los datos actuales…"
  COPIA="../copias-seguridad/nicole-$(date +%Y%m%d-%H%M)"
  mkdir -p "$COPIA"
  for T in demandas demanda_agencias demanda_personas demanda_contactos clientes proyectos agencias personas contactos usuarios eventos ajustes avisos; do
    if $W d1 execute "$BD" --remote --json --command "SELECT * FROM $T" > "$COPIA/$T.json.tmp" 2>/dev/null; then mv "$COPIA/$T.json.tmp" "$COPIA/$T.json"
    else mv "$COPIA/$T.json.tmp" "$COPIA/$T.no-disponible.txt"; fi
  done
  echo "    Guardada en $COPIA (los adjuntos siguen en R2)"
fi

echo "3/6 · Almacén de adjuntos (R2)…"
if $W r2 bucket list 2>/dev/null | grep -q "$BUCKET"; then echo "    Ya existe"
elif $W r2 bucket create "$BUCKET" >/dev/null 2>&1; then echo "    Creado"
else
  echo "    R2 no está activado en la cuenta: los adjuntos se guardarán en la base de datos (hasta 1,5 MB)."
  echo "    Para activarlo: panel de Cloudflare › R2 › Enable (gratis hasta 10 GB) y repite el despliegue."
  SIN_R2=1
fi

echo "4/6 · Configuración…"
node -e "
const fs=require('fs');let t=fs.readFileSync('wrangler.toml','utf8');
t=t.replace(/^database_id = \".*\"/m,'database_id = \"$DB_ID\"').replace(/^ADMIN_EMAIL = \".*\"/m,'ADMIN_EMAIL = \"$ADMIN_EMAIL\"');
if('${SIN_R2:-}')t=t.replace(/\n\[\[r2_buckets\]\][^\[]*/,'\n');
fs.writeFileSync('wrangler.toml',t);"

echo "5/6 · Proyecto web…"
if ! $W pages project list 2>/dev/null | grep -q "$PROYECTO"; then
  $W pages project create "$PROYECTO" --production-branch main >/dev/null
fi

echo "6/6 · Publicando…"
$W pages deploy public --project-name "$PROYECTO" --branch main --commit-dirty=true

echo
echo "Listo: https://$PROYECTO.pages.dev (si el nombre estaba cogido, Cloudflare añade un sufijo; mira la URL de arriba)."
echo "Entra con $ADMIN_EMAIL y la contraseña 1111."

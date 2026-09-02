#!/usr/bin/env bash
#
# Instalación en un solo comando de Tintas Auto sobre Ubuntu Server + Docker.
# Uso:
#   git clone <repo> tintas-auto && cd tintas-auto && sudo ./install.sh
#
# Es idempotente: se puede volver a ejecutar sin romper nada (por ejemplo
# tras un "git pull" para actualizar).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

ENV_FILE="$APP_DIR/.env"
CREDS_FILE="/etc/tintas-auto-smb-credentials"
MOUNT_POINT="/mnt/yaiza-paty"

log()  { echo -e "\n\033[1;32m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[aviso]\033[0m $*"; }
die()  { echo -e "\033[1;31m[error]\033[0m $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Ejecuta este script con sudo: sudo ./install.sh"

# ---------------------------------------------------------------------------
# 1) Docker + Compose + cifs-utils
# ---------------------------------------------------------------------------
log "Comprobando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  log "Docker no está instalado, instalando (script oficial get.docker.com)..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  log "Docker ya está instalado."
fi

if ! docker compose version >/dev/null 2>&1; then
  die "Docker está instalado pero falta el plugin 'docker compose'. Instálalo (docker-compose-plugin) y vuelve a lanzar el script."
fi

log "Comprobando cifs-utils (necesario para montar el recurso compartido Windows)..."
if ! dpkg -s cifs-utils >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y cifs-utils
else
  log "cifs-utils ya está instalado."
fi

# ---------------------------------------------------------------------------
# 2) .env — se genera la primera vez, se reutiliza en instalaciones/updates posteriores
# ---------------------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  log ".env ya existe, se reutiliza tal cual (bórralo si quieres reconfigurar desde cero)."
else
  log "Configurando .env (primera instalación)..."
  cp "$APP_DIR/.env.example" "$ENV_FILE"

  read -rp "Servidor del recurso compartido Windows (ej. 192.168.1.10 o nombre): " SMB_SERVER
  read -rp "Ruta del recurso compartido (ej. DEA_G_Admon/FPO/YAIZA-PATY): " SMB_SHARE_PATH
  read -rp "Usuario con acceso de lectura/escritura a esa carpeta: " SMB_USER
  read -rsp "Contraseña de ese usuario: " SMB_PASS
  echo
  SESSION_SECRET="$(openssl rand -hex 32)"

  sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=\"$SESSION_SECRET\"#" "$ENV_FILE"
  sed -i "s#^EXCEL_PATH=.*#EXCEL_PATH=\"$MOUNT_POINT/TintaImpresoras.xlsx\"#" "$ENV_FILE"

  # Credenciales del montaje CIFS, en un fichero aparte con permisos 600
  # (nunca en /etc/fstab en claro).
  umask 077
  cat > "$CREDS_FILE" <<EOF
username=$SMB_USER
password=$SMB_PASS
EOF
  chmod 600 "$CREDS_FILE"

  echo "$SMB_SERVER" > /tmp/tintas-auto-smb-server
  echo "$SMB_SHARE_PATH" > /tmp/tintas-auto-smb-share
fi

# ---------------------------------------------------------------------------
# 3) Montaje persistente del recurso compartido Windows
# ---------------------------------------------------------------------------
mkdir -p "$MOUNT_POINT"

if [ -f /tmp/tintas-auto-smb-server ]; then
  SMB_SERVER="$(cat /tmp/tintas-auto-smb-server)"
  SMB_SHARE_PATH="$(cat /tmp/tintas-auto-smb-share)"
  FSTAB_LINE="//$SMB_SERVER/$SMB_SHARE_PATH $MOUNT_POINT cifs credentials=$CREDS_FILE,uid=root,gid=root,file_mode=0664,dir_mode=0775,_netdev,nofail 0 0"

  if ! grep -qF "$MOUNT_POINT" /etc/fstab 2>/dev/null; then
    log "Añadiendo el montaje a /etc/fstab para que persista tras reiniciar..."
    echo "$FSTAB_LINE" >> /etc/fstab
  fi
  rm -f /tmp/tintas-auto-smb-server /tmp/tintas-auto-smb-share
fi

log "Montando el recurso compartido en $MOUNT_POINT..."
if mountpoint -q "$MOUNT_POINT"; then
  log "Ya estaba montado."
else
  mount "$MOUNT_POINT" || warn "No se pudo montar ahora mismo. Revisa /etc/fstab y las credenciales en $CREDS_FILE, y vuelve a intentar con: mount $MOUNT_POINT"
fi

if [ -f "$MOUNT_POINT/TintaImpresoras.xlsx" ]; then
  log "Excel encontrado en el recurso compartido: $MOUNT_POINT/TintaImpresoras.xlsx"
else
  warn "No se ve TintaImpresoras.xlsx en $MOUNT_POINT todavía. Revisa la ruta del recurso compartido en el .env (EXCEL_PATH) si hace falta."
fi

mkdir -p "$APP_DIR/data"

# ---------------------------------------------------------------------------
# 4) Construir y levantar los contenedores
# ---------------------------------------------------------------------------
log "Construyendo la imagen Docker (puede tardar unos minutos la primera vez)..."
docker compose build

log "Levantando los servicios (web + poller)..."
docker compose up -d

# ---------------------------------------------------------------------------
# 5) Migraciones de base de datos + usuario admin semilla
# ---------------------------------------------------------------------------
log "Aplicando migraciones de base de datos..."
docker compose exec -T web pnpm exec prisma migrate deploy

log "Creando el usuario administrador semilla si no existe (administrador / Almeria2026!)..."
docker compose exec -T web pnpm exec prisma db seed

# ---------------------------------------------------------------------------
# 6) Comprobación final
# ---------------------------------------------------------------------------
log "Comprobando que el panel responde..."
sleep 3
if curl -fsS -o /dev/null "http://localhost:3000/login"; then
  log "Todo listo. Panel disponible en http://$(hostname -I | awk '{print $1}'):3000"
  log "Usuario admin: administrador / Almeria2026!  (cámbialo desde el panel en cuanto entres)"
else
  warn "El panel no ha respondido todavía en el puerto 3000. Revisa los logs con: docker compose logs -f web"
fi

log "Instalación completada. Consulta INSTALL.md para logs, actualización y solución de problemas."

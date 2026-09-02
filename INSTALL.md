# Instalación — Tintas Auto (Ubuntu Server + Docker)

## Instalación en un solo comando

En un Ubuntu Server limpio, con acceso a internet, a la LAN de las impresoras y al recurso
compartido Windows donde vive `TintaImpresoras.xlsx`:

```bash
git clone <repo> tintas-auto
cd tintas-auto
sudo ./install.sh
```

El script es idempotente: puedes volver a ejecutarlo (por ejemplo tras un `git pull`) sin
romper nada — reutiliza el `.env` y el montaje si ya existen.

Te pedirá, solo la primera vez:

- Servidor del recurso compartido Windows (IP o nombre).
- Ruta del recurso compartido (la carpeta donde está `TintaImpresoras.xlsx`).
- Usuario y contraseña con permiso de lectura/escritura sobre esa carpeta.

Al terminar verás la URL del panel y las credenciales del usuario administrador semilla.

---

## Qué hace el script, paso a paso (por si prefieres ir a mano o algo falla)

### 1. Instalar Docker y dependencias del sistema

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
apt-get update -y
apt-get install -y cifs-utils
```

`cifs-utils` es lo que permite montar un recurso compartido Windows (SMB/CIFS) en Linux.

### 2. Configurar el acceso al Excel compartido

Se guardan las credenciales del recurso compartido en un fichero con permisos restringidos
(nunca en claro en `/etc/fstab`):

```bash
cat > /etc/tintas-auto-smb-credentials <<EOF
username=TU_USUARIO
password=TU_CONTRASEÑA
EOF
chmod 600 /etc/tintas-auto-smb-credentials
```

Y se añade una línea a `/etc/fstab` para que el montaje sea persistente tras reiniciar:

```
//SERVIDOR/DEA_G_Admon/FPO/YAIZA-PATY /mnt/yaiza-paty cifs credentials=/etc/tintas-auto-smb-credentials,uid=root,gid=root,file_mode=0664,dir_mode=0775,_netdev,nofail 0 0
```

```bash
mkdir -p /mnt/yaiza-paty
mount /mnt/yaiza-paty
```

Comprueba que `TintaImpresoras.xlsx` aparece dentro:

```bash
ls /mnt/yaiza-paty
```

### 3. Configurar `.env`

```bash
cp .env.example .env
```

Edita al menos:

- `EXCEL_PATH` → `/mnt/yaiza-paty/TintaImpresoras.xlsx`
- `SESSION_SECRET` → una cadena aleatoria larga (`openssl rand -hex 32`)

El resto de valores (intervalos, umbral, email) tienen valores por defecto razonables y
también se pueden ajustar después desde el panel (`/ajustes`), sin tocar el servidor.

### 4. Construir y levantar los contenedores

```bash
docker compose build
docker compose up -d
```

Esto levanta dos contenedores:

- **web**: el panel (puerto 3000).
- **poller**: el proceso que sondea las impresoras por SNMP y sincroniza el Excel, en
  segundo plano, funcione o no funcione nadie con el panel abierto en el navegador.

### 5. Migraciones y usuario administrador

```bash
docker compose exec -T web pnpm exec prisma migrate deploy
docker compose exec -T web pnpm exec prisma db seed
```

Esto crea las tablas y el usuario administrador semilla (`administrador` /
`Almeria2026!`) si todavía no existe. **Cambia esa contraseña desde el panel en cuanto
entres** (Usuarios → Restablecer contraseña).

### 6. Importar los datos actuales del Excel (primera vez)

```bash
docker compose exec -T web pnpm run import:excel /mnt/yaiza-paty/TintaImpresoras.xlsx
```

Lee el Excel real y crea en la base de datos los departamentos, impresoras, filas de
cartucho y celdas STOCK tal y como están hoy. Es seguro volver a ejecutarlo (no duplica
nada), por ejemplo si alguien añade una impresora nueva directamente en el Excel.

### 7. Comprobar que funciona

```bash
curl http://localhost:3000/login
docker compose logs -f poller
```

---

## Operación diaria

**Ver logs en vivo:**

```bash
docker compose logs -f web       # panel
docker compose logs -f poller    # sondeo SNMP + sincronización Excel
```

**Forzar un sondeo o una sincronización sin esperar al intervalo normal:** desde el panel,
en `/ajustes` → "Sondear impresoras ahora" / "Sincronizar Excel ahora" (solo administradores).

**Actualizar a una versión nueva:**

```bash
cd tintas-auto
git pull
sudo ./install.sh
```

(`install.sh` reconstruye la imagen, reinicia los contenedores y aplica migraciones nuevas
si las hay; no vuelve a pedir las credenciales del recurso compartido si el `.env` ya existe.)

**Parar / arrancar:**

```bash
docker compose down     # para los contenedores (no borra datos)
docker compose up -d    # los vuelve a levantar
```

**Desinstalar por completo** (borra también la base de datos local, no el Excel):

```bash
docker compose down -v
sudo rm -rf tintas-auto
sudo umount /mnt/yaiza-paty
sudo sed -i '\#/mnt/yaiza-paty#d' /etc/fstab
sudo rm -f /etc/tintas-auto-smb-credentials
```

---

## Solución de problemas

| Síntoma | Causa probable | Qué mirar |
|---|---|---|
| El panel no responde en el puerto 3000 | El contenedor `web` no ha arrancado bien | `docker compose logs web` |
| En `/ajustes` sale `DEFERRED_LOCKED` repetido | Alguien tiene el Excel abierto en Windows | Normal, se reintenta solo en el siguiente ciclo |
| En `/ajustes` sale `FAILED` con error de fichero | El montaje CIFS se ha caído | `mountpoint /mnt/yaiza-paty`, y si hace falta `mount /mnt/yaiza-paty` |
| Una impresora sale siempre "Sin datos" o con error | SNMP no llega a esa IP, o la comunidad/versión no es la esperada | `docker compose logs poller`, revisar IP/comunidad SNMP de esa impresora en `/impresoras/[id]` |
| No llegan los emails de aviso | Falta configurar SMTP o Microsoft Graph en `.env` | Ver la sección de email en `.env.example`; mientras tanto se loguean como "simulados" en `docker compose logs poller` |

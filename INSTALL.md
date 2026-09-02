# Instalación — Tintas Auto (Ubuntu Server 24.04 + Docker)

El código ya está en GitHub (privado): **https://github.com/Alvarogmerz/tintas**

Hay dos formas de llevar el proyecto al servidor. Ahora que ya existe el repositorio,
la **Opción A (clonar por git)** es la más simple y además deja el servidor listo para
actualizarse solo con `git pull`. La **Opción B (RAR)** es la que pediste al principio —
también funciona bien, sobre todo si el servidor no tiene salida a internet hacia GitHub
y solo puedes llevarle archivos por red local o USB. Elige una de las dos, no hace falta
hacer las dos.

---

## Paso 0 — Preparar el Ubuntu Server (para las dos opciones)

Esto hace falta sí o sí, sea cual sea la opción que elijas para llevar el código.

### 0.1 Actualizar el sistema

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 0.2 Instalar Docker Engine + Docker Compose

Ubuntu 24.04 no trae Docker de fábrica. Se instala con el script oficial (instala
también el plugin `docker compose`, que es el que usa esta app):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
```

Comprueba que se instaló bien:

```bash
docker --version
docker compose version
```

Deberías ver algo como `Docker version 27.x` y `Docker Compose version v2.x`.

**(Opcional pero recomendado)** para no tener que escribir `sudo` delante de cada
comando `docker`:

```bash
sudo usermod -aG docker $USER
```

Cierra la sesión SSH y vuelve a entrar para que el cambio de grupo tenga efecto.

### 0.3 Instalar el resto de herramientas necesarias

```bash
sudo apt-get install -y cifs-utils git curl unrar
```

- `cifs-utils` → para montar el recurso compartido Windows donde vive el Excel.
- `git` → para clonar/actualizar el proyecto desde GitHub.
- `unrar` → solo hace falta si vas a usar la Opción B (RAR). Si el paquete no está
  disponible en tu instalación (algunas imágenes mínimas de Ubuntu no traen el
  repositorio "universe" activado), primero ejecuta:
  ```bash
  sudo add-apt-repository universe
  sudo apt-get update
  sudo apt-get install -y unrar
  ```

---

## Opción A — Clonar desde GitHub (recomendada)

Como el repositorio es **privado**, hace falta un token de acceso (PAT) para poder
clonarlo desde el servidor.

### A.1 Crear un token de acceso en GitHub

1. En tu navegador: GitHub → foto de perfil (arriba a la derecha) → **Settings**.
2. Menú izquierdo, al final: **Developer settings**.
3. **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.
4. Ponle un nombre (p.ej. "servidor tintas-auto"), marca el permiso **`repo`** (acceso
   completo a repositorios privados), y genera el token.
5. **Cópialo ahora** — GitHub solo lo enseña una vez.

### A.2 Clonar el proyecto en el servidor

```bash
cd /opt
sudo git clone https://github.com/Alvarogmerz/tintas.git tintas-auto
cd tintas-auto
```

Al pedir usuario y contraseña:
- **Usuario**: tu usuario de GitHub (`Alvarogmerz`).
- **Contraseña**: pega el **token** que copiaste (no tu contraseña normal de GitHub).

Para no tener que volver a escribirlo cada vez (útil para el `git pull` de las
actualizaciones futuras), dile a git que recuerde las credenciales:

```bash
sudo git config --global credential.helper store
```

(la próxima vez que te pida usuario/token, quedará guardado en el propio servidor).

Salta directamente al **Paso 1** de más abajo.

---

## Opción B — Transferir por RAR

### B.1 En tu PC Windows: preparar el paquete

**Importante**: no comprimas la carpeta `d:\tintas-auto` tal cual — arrastraría
`node_modules` (cientos de MB), la base de datos local de pruebas, y tu `.env` con
claves locales. Antes de crear el RAR, asegúrate de **excluir**:

- `node_modules`
- `.next`
- `dist-worker`
- `data`
- `.env`
- `.git` (opcional excluirla; si la incluyes, el servidor ya queda con el historial
  git listo para conectarlo a GitHub más adelante — ver Paso 4)

Con WinRAR: selecciona todos los archivos y carpetas de `d:\tintas-auto` **excepto**
los de la lista de arriba → botón derecho → **Añadir al archivo...** → nombra el
archivo, por ejemplo `tintas-auto.rar`.

### B.2 Copiar el RAR al servidor

Desde PowerShell (usa `scp`, ya viene instalado en Windows 10/11):

```powershell
scp d:\tintas-auto.rar usuario@IP_DEL_SERVIDOR:/opt/
```

(cambia `usuario` e `IP_DEL_SERVIDOR` por los datos reales de tu Ubuntu Server; te
pedirá la contraseña SSH de ese usuario). Si prefieres algo con ventanas, puedes usar
[WinSCP](https://winscp.net/) en vez de la línea de comandos.

### B.3 Extraer en el servidor

```bash
cd /opt
sudo unrar x tintas-auto.rar
sudo mv tintas-auto-* tintas-auto   # si el rar creó una subcarpeta con otro nombre
cd tintas-auto
```

Comprueba que `install.sh` y `docker-compose.yml` están ahí:

```bash
ls
```

---

## Paso 1 — Ejecutar la instalación

Desde dentro de la carpeta del proyecto (`/opt/tintas-auto`):

```bash
sudo chmod +x install.sh
sudo ./install.sh
```

El script es idempotente: puedes volver a ejecutarlo sin miedo (por ejemplo, tras
actualizar) — reutiliza el `.env` y el montaje si ya existen.

Te pedirá, **solo la primera vez**:

- Servidor del recurso compartido Windows (IP o nombre).
- Ruta del recurso compartido (la carpeta donde está `TintaImpresoras.xlsx`).
- Usuario y contraseña con permiso de lectura/escritura sobre esa carpeta.

Y por debajo va haciendo, automáticamente:

1. Comprobar/instalar Docker y `cifs-utils` (si no se hizo ya en el Paso 0).
2. Guardar las credenciales del recurso compartido en un fichero con permisos
   restringidos (`/etc/tintas-auto-smb-credentials`, nunca en claro en `/etc/fstab`).
3. Montar el recurso compartido en `/mnt/yaiza-paty`, de forma persistente tras
   reiniciar.
4. Generar el `.env` (con un `SESSION_SECRET` aleatorio) a partir de `.env.example`.
5. `docker compose build` y `docker compose up -d` (levanta los contenedores `web` y
   `poller`).
6. Migrar la base de datos y crear el usuario administrador semilla.
7. Comprobar que el panel responde.

Al terminar verás la URL del panel y las credenciales del usuario administrador:
**`administrador` / `Almeria2026!`** — cámbiala desde el panel en cuanto entres
(Usuarios → Restablecer contraseña).

### 1.1 Importar los datos actuales del Excel (primera vez)

```bash
docker compose exec -T web pnpm run import:excel /mnt/yaiza-paty/TintaImpresoras.xlsx
```

Lee el Excel real y crea en la base de datos los departamentos, impresoras, filas de
cartucho y celdas STOCK/PEDIR tal y como están hoy. También puedes hacerlo desde el
propio panel: Ajustes → "Reimportar impresoras del Excel".

### 1.2 Comprobar que funciona

```bash
curl http://localhost:3000/login
docker compose logs -f poller
```

Entra desde un navegador a `http://IP_DEL_SERVIDOR:3000`.

---

## Paso 2 — Conectar el servidor a GitHub (si usaste la Opción B con RAR)

Si instalaste por RAR, el servidor todavía no sabe nada de git. Para poder
actualizarlo en el futuro con `git pull` en vez de volver a mandar un RAR cada vez:

```bash
cd /opt/tintas-auto
sudo git init
sudo git remote add origin https://github.com/Alvarogmerz/tintas.git
sudo git fetch origin
sudo git checkout -f master
sudo git branch --set-upstream-to=origin/master master
sudo git config --global credential.helper store
```

Al hacer el `fetch`/`checkout` te pedirá usuario y token (igual que en la Opción A.2).
`checkout -f` sobrescribe los archivos de código con los que ya hay en GitHub (que son
los mismos, así que no debería cambiar nada) — **no toca** `data/`, `.env` ni
`node_modules`, porque están fuera del control de git (`.gitignore`).

Si instalaste con la Opción A (clonaste directamente), no hace falta hacer nada de
esto — ya está conectado desde el principio.

---

## Actualizaciones futuras

A partir de aquí, siempre que hagas cambios en el proyecto (tú, o pidiéndomelos a mí)
y los subas a GitHub, para llevarlos al servidor:

**En tu PC Windows** (donde está el proyecto con Claude Code):

```bash
git add -A
git commit -m "Describe aquí el cambio"
git push
```

**En el servidor:**

```bash
cd /opt/tintas-auto
sudo git pull
sudo ./install.sh
```

`install.sh` reconstruye la imagen Docker, reinicia los contenedores y aplica
migraciones de base de datos nuevas si las hay — es seguro ejecutarlo aunque no haya
cambios.

---

## Operación diaria

**Ver logs en vivo:**

```bash
docker compose logs -f web       # panel
docker compose logs -f poller    # sondeo SNMP + sincronización Excel
```

**Forzar un sondeo o una sincronización sin esperar al intervalo normal:** desde el
panel, en `/ajustes` → "Sondear impresoras ahora" / "Sincronizar Excel ahora" (solo
administradores).

**Parar / arrancar:**

```bash
docker compose down     # para los contenedores (no borra datos)
docker compose up -d    # los vuelve a levantar
```

**Desinstalar por completo** (borra también la base de datos local, no el Excel):

```bash
cd /opt/tintas-auto
docker compose down -v
sudo umount /mnt/yaiza-paty
sudo sed -i '\#/mnt/yaiza-paty#d' /etc/fstab
sudo rm -f /etc/tintas-auto-smb-credentials
cd /opt
sudo rm -rf tintas-auto
```

---

## Solución de problemas

| Síntoma | Causa probable | Qué mirar |
|---|---|---|
| El panel no responde en el puerto 3000 | El contenedor `web` no ha arrancado bien | `docker compose logs web` |
| `git clone`/`git pull` pide usuario y contraseña una y otra vez | El token no se guardó | Repite `sudo git config --global credential.helper store` y vuelve a introducirlo una vez más |
| `git pull` dice "Authentication failed" | El token caducó o no tiene permiso `repo` | Genera uno nuevo (Paso A.1) |
| En `/ajustes` sale `DEFERRED_LOCKED` repetido | Alguien tiene el Excel abierto en Windows | Normal, se reintenta solo en el siguiente ciclo |
| En `/ajustes` sale `FAILED` con error de fichero, o el panel avisa de "Excel no encontrado" | El montaje CIFS se ha caído, o alguien ha borrado el archivo | `mountpoint /mnt/yaiza-paty` y `mount /mnt/yaiza-paty` si hace falta; si el archivo se borró de verdad, restaura desde Ajustes → "Restaurar desde la última copia" |
| Una impresora sale siempre "Sin datos" o con error | SNMP no llega a esa IP, o la comunidad/versión no es la esperada | `docker compose logs poller`, revisar IP/comunidad SNMP de esa impresora en `/impresoras/[id]` (botón "Probar conexión ahora") |
| No llegan los emails de aviso | Falta configurar SMTP o Microsoft Graph en `.env` | Ver la sección de email en `.env.example`; mientras tanto se loguean como "simulados" en `docker compose logs poller` |

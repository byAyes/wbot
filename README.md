# 🐚 Nautilus - Discord Bot

[![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Environment-Node.js-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/Library-discord.js-5865F2?style=for-the-badge&logo=discord)](https://discord.js.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite)](https://www.sqlite.org/)

> **Nautilus** es un bot de Discord todo-en-uno para descargar contenido multimedia de YouTube, Spotify, Instagram y Pinterest, además de utilidades como registro de cumpleaños.

---

## ✨ Funcionalidades

| Comando | Descripción |
|---------|-------------|
| `/play <query> [formato]` | Busca y descarga audio/video de YouTube |
| `/spotify <query>` | Busca información y descarga canciones de Spotify |
| `/pinterest <url>` | Descarga imágenes/videos de Pinterest |
| `/instagram <url>` | Descarga videos y reels de Instagram |
| `/download <url> [formato]` | Descarga desde enlaces directos con yt-dlp |
| `/birthday set <DD-MM-YYYY>` | Guarda tu fecha de cumpleaños |
| `/birthday list` | Muestra los próximos cumpleaños |
| `/birthday get` | Muestra tu cumpleaños guardado |
| `/birthday delete` | Elimina tu cumpleaños |
| `/ping` | Muestra la latencia del bot |
| `/help` | Muestra todos los comandos disponibles |

---

## 🚀 Requisitos

- **Node.js** v18 o superior
- **Python** 3.x (para yt-dlp-exec, opcional)
- **ffmpeg** (para conversión de audio/video, opcional)
- Un **bot de Discord** registrado en el [Developer Portal](https://discord.com/developers/applications)

---

## 🔧 Instalación

### 1. Clona el repositorio

```bash
git clone https://github.com/tu-usuario/nautilus.git
cd nautilus
```

### 2. Instala las dependencias

```bash
npm install
```

> **Nota:** Si usas Windows y tienes problemas con `yt-dlp-exec`, instala Python desde [python.org](https://python.org) o ejecuta:
> ```bash
> npm install --ignore-scripts
> ```

### 3. Configura las variables de entorno

Crea un archivo `.env` en la raíz:

```env
# === Discord Configuration ===
DISCORD_TOKEN=tu_token_de_discord_aqui
CLIENT_ID=tu_client_id_de_discord_aqui

# === External APIs (multimedia downloads) ===
API_URL=https://api.stellarwa.xyz
API_KEY=tu_api_key_aqui
ALTERNATIVE_API_URL=https://api.siputzx.my.id

# === Optional ===
LOG_LEVEL=INFO
```

### 4. Registra los comandos slash

```bash
node deploy-commands.js
```

### 5. Inicia el bot

```bash
npm start
```

---

## ☁️ Deploy en Railway / Render

### Railway

1. Crea una cuenta en [Railway](https://railway.app)
2. Conecta tu repositorio de GitHub
3. Railway detectará automáticamente el `Dockerfile`
4. Configura las variables de entorno en Railway Dashboard
5. ¡Despliega!

### Render

1. Crea una cuenta en [Render](https://render.com)
2. Selecciona **New Web Service** → conecta tu repositorio
3. Configura:
   - **Runtime:** Docker
   - **Build Command:** (dejarlo vacío, usa el Dockerfile)
   - **Start Command:** (dejarlo vacío)
4. Agrega las variables de entorno
5. Despliega

> ⚠️ **Importante:** Después del deploy, ejecuta `node deploy-commands.js` localmente (o mediante un script en el panel) para registrar los comandos slash en Discord.

---

## 🗄️ Base de Datos

Nautilus usa **SQLite** para almacenar los cumpleaños (migración automática desde el antiguo formato JSON).

- Archivo: `data/nautilus.db`
- Se crea automáticamente al ejecutar el bot

---

## 🔌 APIs Externas

El bot usa APIs externas para las descargas multimedia:

| Servicio | APIs utilizadas |
|----------|----------------|
| YouTube | `API_URL` + `ALTERNATIVE_API_URL` |
| Spotify | `API_URL` (búsqueda) + `ALTERNATIVE_API_URL` (descarga) |
| Pinterest | `API_URL` + `ALTERNATIVE_API_URL` |
| Instagram | `ALTERNATIVE_API_URL` |
| General | yt-dlp + ffmpeg (locales) |

---

## 📁 Estructura del Proyecto

```
nautilus/
├── commands/          # Comandos slash
│   ├── youtube.js     # /play
│   ├── spotify.js     # /spotify
│   ├── pinterest.js   # /pinterest
│   ├── instagram.js   # /instagram
│   ├── download.js    # /download
│   ├── birthday.js    # /birthday
│   ├── utility.js     # /ping
│   └── help.js        # /help
├── database/          # Capa de persistencia
│   └── setup.js       # SQLite + CRUD
├── utils/             # Utilidades
│   ├── api.js         # Helpers de APIs con retry
│   └── logger.js      # Logging con colores
├── data/              # Datos runtime (DB, descargas)
├── index.js           # Entry point
├── deploy-commands.js # Registro de comandos
├── Dockerfile         # Contenedor Docker
└── package.json
```

---

## 🐳 Docker

```bash
# Build
docker build -t nautilus-bot .

# Run
docker run -d \
  --name nautilus \
  --env-file .env \
  -v nautilus-data:/usr/src/app/data \
  nautilus-bot
```

---

## 🧪 Comandos de Desarrollo

```bash
# Verificar sintaxis de todos los archivos
node --check index.js && node --check commands/*.js

# Registrar comandos slash
node deploy-commands.js

# Iniciar en modo desarrollo
node index.js
```

---

## 📄 Licencia

ISC

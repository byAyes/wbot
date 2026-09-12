# Carlos - Discord Bot

[![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Environment-Node.js-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![discord.js](https://img.shields.io/badge/Library-discord.js-5865F2?style=for-the-badge&logo=discord)](https://discord.js.org/)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite)](https://www.sqlite.org/)

> **Carlos** es un bot de Discord todo-en-uno con **IA híbrida**: descarga multimedia (YouTube, Spotify, Instagram, Pinterest), musica en voz, recordatorios, encuestas, clima y un asistente de IA conversacional.
---

## Funcionalidades

### Musica y Multimedia
| Comando | Descripción |
|---------|-------------|
| /play <query> | Busca y reproduce audio/video de YouTube, Spotify, SoundCloud, Deezer |
| /music download <query> [fmt] | Descarga audio/video |
| /music skip/stop/pause/resume | Control de reproducción |
| /music queue/nowplaying | Ver cola y canción actual |
| /music volume <1-100> | Ajustar volumen |
| /music shuffle/loop | Modos de reproducción |
| /music filters <filtro> | Efectos de audio (20 presets) |
| /spotify <query> | Busca y descarga canciones de Spotify |
| /pinterest <url> | Descarga imagenes/videos de Pinterest |
| /instagram <url> | Descarga videos y reels de Instagram |
| /download <url> [fmt] | Descarga desde enlaces directos |

### IA Hibrida
| Comando | Descripción |
|---------|-------------|
| /chat <pregunta> | Habla con la IA de Carlos (lenguaje natural) |
| /ask <pregunta> | Pregunta rapida a la IA |
| @Carlos <mensaje> | Menciona al bot para conversar (sin comando) |

### Utilidades
| Comando | Descripción |
|---------|-------------|
| /birthday set <DD-MM-YYYY> | Guarda tu fecha de cumpleaños |
| /birthday list | Muestra los proximos cumpleaños |
| /reminder set <fecha> <mensaje> | Configura un recordatorio |
| /reminder list | Ver recordatorios pendientes |
| /reminder delete <id> | Eliminar un recordatorio |
| /weather <ciudad> | Consulta el clima |
| /poll <pregunta> [opciones] | Crea una encuesta |
| /ping | Muestra la latencia del bot |
| /help | Muestra todos los comandos |

### Moderacion
| Comando | Descripción |
|---------|-------------|
| /hos setup | Configurar Hall of Shame (Admin) |
| /hos ranking | Usuarios mas nominados |
| /hos recent | Ultimas entradas |
---

## Requisitos

- **Node.js** v18 o superior
- **Python** 3.x (para yt-dlp-exec, opcional)
- **ffmpeg** (para conversion de audio/video, opcional)
- Un **bot de Discord** registrado en el [Developer Portal](https://discord.com/developers/applications)
- **(Opcional) API de IA** para el asistente conversacional (OpenAI, Groq o Anthropic)

---

## Instalacion

### 1. Clona el repositorio

```bash
git clone https://github.com/byAyes/wbot.git
cd wbot
```

### 2. Instala las dependencias

```bash
npm install
```

> **Nota:** Si usas Windows y tienes problemas con yt-dlp-exec, instala Python desde [python.org](https://python.org) o ejecuta:

```bash
npm install --ignore-scripts
```

### 3. Configura las variables de entorno

Copia el archivo .env.example a .env y completa los valores:

```bash
cp .env.example .env
```

Edita .env y configura al menos:
- **DISCORD_TOKEN** y **CLIENT_ID** (obligatorios)
- **AI_PROVIDER** + **OPENAI_API_KEY** (para IA, opcional pero recomendado)
- **BOT_OWNER_ID** (para comandos de owner)

### 4. Registra los comandos slash

```bash
node deploy-commands.js
```

### 5. Inicia el bot

```bash
npm start
```

---

## Configuración de IA

El bot soporta tres proveedores de IA. Configuralos en .env:

### OpenAI (recomendado)
```env
AI_PROVIDER=openai
OPENAI_API_KEY=tu_clave
OPENAI_MODEL=gpt-4o-mini
```

### Groq (alternativa gratuita)
```env
AI_PROVIDER=groq
GROQ_API_KEY=tu_clave
GROQ_MODEL=llama-3.1-8b-instant
```

### Anthropic
```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=tu_clave
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

---

## Base de Datos

Carlos usa **SQLite** (node:sqlite) para persistencia. Las tablas son:
- **birthdays** - Cumpleanos de usuarios
- **hall_of_shame** - Entradas del Hall of Shame
- **guild_configs** - Configuración por servidor
- **conversation_history** - Historial de conversaciones con IA
- **reminders** - Recordatorios pendientes

Archivo: data/nautilus.db (se crea automaticamente)

---

## Estructura del Proyecto

```
wbot/
├── commands/          # 16 comandos slash
├── events/
│   └── messageCreate.js  # IA + Hall of Shame unificado
├── services/
│   ├── aiService.js           # Wrapper LLM (OpenAI/Groq/Anthropic)
│   ├── intentClassifier.js     # Clasificador de intenciones
│   ├── knowledgeBase.js        # Base de conocimiento RAG
│   └── reminderService.js      # Scheduler de recordatorios
├── utils/
│   ├── fileSender.js           # Envio de archivos centralizado
│   ├── errorHandler.js         # Manejo unificado de errores
│   ├── rateLimiter.js          # Rate limiting
│   ├── api.js                  # Helpers de APIs con retry
│   └── logger.js               # Logging con colores
├── database/
│   └── setup.js                # SQLite + CRUD
├── knowledge/
│   └── faq.md                  # Base de conocimiento
├── index.js                    # Entry point
├── deploy-commands.js          # Registro de comandos
├── Dockerfile
└── package.json
```

---

## Docker

```bash
# Build
docker build -t carlos-bot .

# Run
docker run -d \
  --name carlos \
  --env-file .env \
  -v carlos-data:/usr/src/app/data \
  carlos-bot
```

---

## Comandos de Desarrollo

```bash
# Verificar sintaxis de todos los archivos
npm test

# Registrar comandos slash
node deploy-commands.js

# Iniciar en modo desarrollo
npm run dev
```

---

## Licencia

ISC

# Carlos - WhatsApp Bot

[![Node.js](https://img.shields.io/badge/Environment-Node.js-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![OpenWA](https://img.shields.io/badge/Library-OpenWA-blue?style=for-the-badge)](https://github.com/rmyndharis/OpenWA)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?style=for-the-badge&logo=sqlite)](https://www.sqlite.org/)

> **Carlos** es un bot de WhatsApp con **IA híbrida**: asistente conversacional, recordatorios, cumpleaños, clima, encuestas. Usa OpenWA (rmyndharis) como API Gateway con motor Baileys.

---

## Arquitectura

```
OpenWA (API Gateway :2785)
  └── Baileys Engine (WebSocket, sin navegador)

Carlos Bot (Node.js :3000)
  ├── Express Server (Webhooks)
  ├── IA Service (OpenAI/Groq/Anthropic)
  ├── Intent Classifier (regex routing)
  ├── Knowledge Base (RAG)
  ├── Reminder Service (SQLite)
  └── SQLite (node:sqlite built-in)
```

## Funcionalidades

- **IA Híbrida**: Clasificador de intenciones + LLM (OpenAI/Groq/Anthropic)
- **Recordatorios**: /reminder set/list/delete con notificaciones
- **Cumpleaños**: /birthday set/list/get/delete
- **Clima**: /weather <ciudad>
- **Encuestas**: /poll <pregunta> [opciones]
- **Comandos básicos**: /help, /ping

---

## Instalacion

### 1. Instalar OpenWA (API Gateway)

```bash
cd ../openwa
npm ci
cp .env.minimal .env
# Editar .env: ENGINE_TYPE=baileys
npm run start:dev
```

### 2. Instalar Carlos Bot

```bash
cd ../wbot-whatsapp
npm install
cp .env.example .env
# Editar .env con OPENWA_API_KEY
npm start
```

### 3. Conectar WhatsApp

1. Abre OpenWA Dashboard en http://localhost:2886
2. Crea una nueva sesion
3. Escanea el QR code con tu telefono
4. Carlos Bot estara disponible

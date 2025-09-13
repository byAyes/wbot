# cBotWA - Tu Asistente de WhatsApp

¡Bienvenido a WBot, tu asistente personal para WhatsApp! Este bot te permite descargar contenido multimedia de varias plataformas directamente en tus chats.

[![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow?style=for-the-badge&logo=javascript)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Node.js](https://img.shields.io/badge/Environment-Node.js-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![whatsapp-web.js](https://img.shields.io/badge/Library-whatsapp--web.js-brightgreen?style=for-the-badge)](https://wwebjs.dev/)

## ✨ Funcionalidades

cBotWA ofrece una variedad de funciones para enriquecer tu experiencia en WhatsApp:

- **Descarga de YouTube:** Busca y descarga videos o audios de YouTube.
- **Descarga de Pinterest:** Descarga videos e imágenes desde enlaces de Pinterest.
- **Búsqueda en Spotify:** Busca información de canciones en Spotify y te ofrece la opción de descargarlas.

---

## 🚀 Comandos

A continuación se detallan los comandos disponibles y cómo usarlos:

### `.p`, `.play`, `.d`, `.descargar`

Este comando es tu navaja suiza para descargar contenido. Puedes usarlo con un término de búsqueda para YouTube o con un enlace de Pinterest.

**Uso:**
- `.p <nombre de la canción o video>`
- `.play <nombre de la canción o video>`
- `.d <URL de Pinterest>`
- `.descargar <URL de Pinterest>`

**Ejemplos:**
- `.p Imagine Dragons - Believer`
- `.d https://pin.it/1a2b3c4d`

Al buscar en YouTube, el bot te preguntará si deseas descargar el contenido como **audio** o **video**.

### `.spotify`, `.s`, `.sp`

Usa este comando para buscar información sobre una canción en Spotify.

**Uso:**
- `.spotify <nombre de la canción>`
- `.s <nombre de la canción>`
- `.sp <nombre de la canción>`

**Ejemplo:**
- `.spotify Queen - Bohemian Rhapsody`

El bot te mostrará la información de la canción y te preguntará si deseas descargarla. Si respondes `si`, el bot buscará la canción en YouTube y la descargará por ti.

---

## 🔧 Instalación

Para poner en marcha tu propio WBot, sigue estos pasos:

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/tu-usuario/wbot.git
   cd wbot
   ```

2. **Instala las dependencias:**
   Asegúrate de tener [Node.js](https://nodejs.org/) instalado. Luego, ejecuta:
   ```bash
   npm install
   ```

3. **Configura tus variables de entorno:**
      Crea un archivo `.env` en la raíz del proyecto y añade tus credenciales de la API:
   ```
   API_URL=https://api.stellarwa.xyz
   API_KEY=tu_api_key
   ALTERNATIVE_API_URL=https://api.siputzx.my.id
   ```

4. **Inicia el bot:**
   ```bash
   node index.js
   ```

5. **Escanea el código QR:**
   Abre WhatsApp en tu teléfono y escanea el código QR que aparece en la terminal.

---

## 📦 Dependencias

Este proyecto utiliza las siguientes dependencias principales:

- `axios`: Para realizar peticiones HTTP.
- `dotenv`: Para manejar variables de entorno.
- `express`: Para crear el servidor web.
- `qrcode-terminal`: Para mostrar el código QR de WhatsApp en la terminal.
- `whatsapp-web.js`: La librería principal para interactuar con WhatsApp Web.
- Y otras más que puedes encontrar en el archivo `package.json`.

---

## 🟢 GitHub Stats

![byAyes's Stats](https://github-readme-stats.vercel.app/api?username=byAyes&theme=vue-dark&show_icons=true&hide_border=true&count_private=true)
![byAyes's Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=byAyes&theme=vue-dark&show_icons=true&hide_border=true&layout=compact)

---

## 📄 Licencia

Este proyecto está bajo la Licencia ISC. Consulta el archivo `LICENSE` para más detalles.

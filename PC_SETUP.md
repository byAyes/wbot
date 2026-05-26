# 🖥️ Ejecutar Carlos Bot en tu PC (Gratis)

Guía para correr el bot 24/7 en tu propia computadora con **PM2**, sin pagar hosting.

---

## 📋 Requisitos

| Requisito | Detalle |
|-----------|---------|
| 💻 **PC** | Windows, macOS o Linux |
| 🌐 **Internet** | Conexión estable (el bot necesita ~50 KB/s) |
| ⏰ **Tiempo encendida** | Mientras la PC esté prendida, el bot funciona |

---

## 1️⃣ Instalar Node.js

Descarga e instala Node.js **versión 20 LTS**:

1. Ve a [nodejs.org](https://nodejs.org)
2. Descarga **Node.js 20.x LTS**
3. Ejecuta el instalador
4. Asegúrate de marcar **"Add to PATH"** durante la instalación

Verifica que se instaló correctamente:

```bash
node --version
npm --version
```

Deberías ver algo como `v20.x.x` y `10.x.x`.

---

## 2️⃣ Descargar el bot

Opción A — Si tienes Git instalado:

```bash
git clone https://github.com/byAyes/Nautilus.git
cd Nautilus
```

Opción B — Sin Git (descarga manual):

1. Ve a [github.com/byAyes/Nautilus](https://github.com/byAyes/Nautilus)
2. Haz clic en **"Code" → "Download ZIP"**
3. Extrae el ZIP en una carpeta, ejemplo: `C:\Nautilus`
4. Abre **PowerShell** o **CMD** en esa carpeta

---

## 3️⃣ Configurar `.env`

Copia el archivo de ejemplo y edítalo:

```bash
copy .env.example .env
```

Abre `.env` con cualquier editor (Bloc de notas, VS Code) y completa los valores:

```env
# === Discord Configuration ===
DISCORD_TOKEN=tu_token_aqui          # Token de Discord Developer Portal
CLIENT_ID=tu_client_id_aqui          # ID de tu aplicación Discord

# === External APIs (multimedia downloads) ===
API_URL=https://api.stellarwa.xyz
API_KEY=tu_api_key_aqui
ALTERNATIVE_API_URL=https://api.siputzx.my.id

# === Owner Configuration ===
BOT_OWNER_ID=tu_id_de_discord_aqui   # Tu ID de usuario Discord

# === Optional ===
LOG_LEVEL=INFO
```

> **¿Dónde conseguir el TOKEN?** Ve a [discord.dev](https://discord.dev) → Applications → tu app → Bot → "Reset Token"
>
> **¿Tu USER ID?** Discord → Ajustes → Avanzado → Modo Desarrollador → Click derecho en tu perfil → "Copiar ID"

---

## 4️⃣ Instalar dependencias

```bash
npm install
```

Esto instalará todas las dependencias incluyendo `@napi-rs/canvas`, `better-sqlite3`, `fluent-ffmpeg`, etc.

> **Nota sobre `better-sqlite3`:** En Windows necesitas **Build Tools de Visual Studio** para compilarlo. Si te da error, ejecuta:
> ```bash
> npm install --global windows-build-tools
> ```
> O instala [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) con la carga de trabajo "Desktop development with C++".

---

## 5️⃣ Registrar los comandos

```bash
node deploy-commands.js
```

Esto registrará todos los comandos del bot (11 comandos) en la API de Discord.

---

## 6️⃣ Probar el bot

```bash
node index.js
```

Si todo funciona, verás algo como:

```
╔══════════════════════════════════════╗
║         CARLOS DISCORD BOT           ║
╚══════════════════════════════════════╝
✅ Conectado como: Carlos#1234
ℹ️ Servidores: 5
ℹ️ Comandos: 11
✅ Sistema de música inicializado correctamente
```

Presiona **Ctrl + C** para detenerlo.

---

## 7️⃣ Mantener el bot siempre activo (PM2)

PM2 es un "gestor de procesos" que mantiene el bot corriendo y lo reinicia si se cae.

### Instalar PM2

```bash
npm install -g pm2
```

### Iniciar el bot con PM2

```bash
pm2 start index.js --name nautilus
```

### Comandos útiles de PM2

```bash
pm2 status              # Ver estado del bot
pm2 logs nautilus       # Ver logs en vivo
pm2 stop nautilus       # Detener el bot
pm2 restart nautilus    # Reiniciar el bot
pm2 delete nautilus     # Eliminar de PM2
```

---

## 8️⃣ Auto-inicio con Windows (pc restart)

Para que el bot arranque **automáticamente cuando enciendas la PC**:

```bash
# Guardar el estado de PM2
pm2 save

# Configurar auto-inicio en Windows
pm2 startup
```

Esto te dará un comando para ejecutar como Administrador que configura PM2 para iniciarse con Windows.

---

## 🧠 Tips importantes

### No cerrar la terminal

PM2 corre en segundo plano, pero si cierras la terminal padre, PM2 también se cierra en Windows.  
**Solución:** Usa `pm2-startup` como se indicó arriba.

### Consumo de recursos

| Recurso | Consumo aproximado |
|---------|:------------------:|
| 💾 RAM | ~80-120 MB |
| 🖥️ CPU | ~1-5% (en reposo) |
| 🌐 Internet | ~50 KB/s |

El bot es muy liviano sin Chromium.

### Si apagas la PC

El bot se desconecta cuando la PC se apaga. Cuando la enciendas de nuevo, PM2 lo levantará automáticamente.

### FFmpeg para música

Si el comando de música no funciona, instala FFmpeg:

1. Descarga de [ffmpeg.org](https://ffmpeg.org/download.html)
2. Extrae en `C:\ffmpeg`
3. Agrega `C:\ffmpeg\bin` a las variables de entorno (PATH)
4. Reinicia la PC

O simplemente usa el paquete `ffmpeg-static` que ya está en `package.json` (no requiere instalación manual).

---

## 🚀 Extra: Cloudflare Tunnel (opcional)

Si quieres acceder a tu bot desde fuera de tu casa (ej: monitoreo por web), puedes usar Cloudflare Tunnel gratis.

Esto **no es necesario** para el funcionamiento del bot, solo si necesitas exponer puertos.

---

## 📝 Resumen rápido

```bash
# Una sola vez:
npm install -g pm2
npm install
node deploy-commands.js

# Cada vez que inicias:
pm2 start index.js --name nautilus

# Para que arranque solo al prender la PC:
pm2 save
pm2 startup
```

¡Y listo! Tu bot corre 24/7 en tu PC sin pagar nada. 🎉

# ☁️ Google Cloud — Hostear Nautilus Bot (Gratis)

Guía para correr el bot 24/7 en una VM **e2-micro** de Google Cloud, totalmente gratis para siempre.

---

## 📋 Requisitos

| Requisito | Detalle |
|-----------|---------|
| 💳 **Tarjeta de crédito/débito** | Google la pide para verificar identidad (~$1 temporal, no cobra) |
| 🌐 **Internet** | Para configurar y mantener el bot |
| ⏱️ **Tiempo** | ~20 minutos de setup |

---

## 1️⃣ Crear cuenta en Google Cloud

1. Ve a [cloud.google.com](https://cloud.google.com)
2. Haz clic en **"Get started for free"**
3. Inicia sesión con tu cuenta de Google
4. Acepta los términos
5. Ingresa tu **tarjeta de crédito/débito** (Google hará un cargo de ~$1 USD temporal para verificar, te lo devuelven)
6. Selecciona **"Cuenta de facturación gratuita"** (Free Tier)

> ⚠️ **Importante:** Te dan $300 USD de crédito gratis por 90 días. Después de esos 90 días, si solo usas recursos del free tier, **nunca te cobran**. Pero si creas recursos que no son gratis, te cobrarán. ¡Usa solo lo que te indico aquí y estarás bien!

---

## 2️⃣ Crear la VM (máquina virtual)

### Paso a paso en la consola:

1. Ve a [console.cloud.google.com](https://console.cloud.google.com)
2. En el menú de hamburguesa (☰) → **Compute Engine** → **VM Instances**
3. Haz clic en **"Create Instance"**

### Configuración exacta:

```
Name: nautilus-bot
Region: us-west1 (Oregon)    ← SOLO estas 3 regiones son gratis
Zone: us-west1-b
Machine type: e2-micro        ← (0.25 vCPU, 1 GB RAM) — gratis
Boot disk: 
  - Operating System: Ubuntu
  - Version: Ubuntu 22.04 LTS
  - Size: 30 GB               ← Máximo gratis
  - Type: Standard persistent disk
Allow HTTP traffic: ❌ No (el bot no necesita web)
Allow HTTPS traffic: ❌ No
```

4. Haz clic en **"Create"**

> ⏳ Espera ~2 minutos mientras se crea la VM.

---

## 3️⃣ Conectarte a la VM por SSH

Cuando la VM esté creada, verás un botón **"SSH"** al lado de tu instancia. Haz clic ahí.

Se abrirá una **terminal en el navegador**. Ahí vas a escribir todos los comandos siguientes.

---

## 4️⃣ Instalar Node.js 20

Ejecuta estos comandos UNO POR UNO en la terminal SSH:

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Instalar dependencias para compilar módulos nativos
sudo apt install -y python3 make g++ ffmpeg git

# Agregar repositorio de Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js
sudo apt install -y nodejs

# Verificar
node --version   # Debe mostrar v20.x.x
npm --version    # Debe mostrar 10.x.x
```

---

## 5️⃣ Clonar el repositorio y configurar

```bash
# Crear carpeta para el bot
mkdir ~/nautilus
cd ~/nautilus

# Clonar el repo
git clone https://github.com/byAyes/wbot.git .
```

### Crear archivo `.env`:

```bash
nano .env
```

Pega esto (con tus valores reales):

```env
# === Discord Configuration ===
DISCORD_TOKEN=tu_token_aqui
CLIENT_ID=tu_client_id_aqui

# === External APIs ===
API_URL=https://api.stellarwa.xyz
API_KEY=tu_api_key_aqui
ALTERNATIVE_API_URL=https://api.siputzx.my.id

# === Owner Configuration ===
BOT_OWNER_ID=tu_id_de_discord_aqui

# === Optional ===
LOG_LEVEL=INFO
```

Para guardar en `nano`: **Ctrl+X** → **Y** → **Enter**

---

## 6️⃣ Instalar dependencias y registrar comandos

```bash
# Instalar dependencias
npm install

# Registrar comandos en Discord
node deploy-commands.js
```

---

## 7️⃣ Probar el bot

```bash
node index.js
```

Si ves algo como:

```
╔══════════════════════════════════════╗
║         NAUTILUS DISCORD BOT         ║
╚══════════════════════════════════════╝
✅ Conectado como: Nautilus#1234
```

**¡Funciona!** Presiona **Ctrl + C** para detenerlo.

---

## 8️⃣ Mantenerlo vivo 24/7 (PM2)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar el bot
pm2 start index.js --name nautilus

# Guardar la configuración para que auto-inicie al reiniciar la VM
pm2 save
pm2 startup
```

El último comando (`pm2 startup`) te mostrará una línea como esta — **cópiala y ejecútala**:

```bash
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u tu_usuario --hp /home/tu_usuario
```

### Comandos útiles de PM2:

```bash
pm2 status              # Ver si el bot está corriendo
pm2 logs nautilus       # Ver logs en vivo
pm2 restart nautilus    # Reiniciar el bot
pm2 stop nautilus       # Detener el bot
pm2 monit              # Monitor (CPU, RAM, etc.)
```

---

## 9️⃣ Actualizar el bot después de cambios

Cuando hagas cambios en el código y los subas a GitHub:

```bash
cd ~/nautilus
git pull
npm install           # Solo si agregaste nuevas dependencias
pm2 restart nautilus
```

Si agregaste nuevos comandos:

```bash
node deploy-commands.js
pm2 restart nautilus
```

---

## 📊 Consumo de recursos esperado

| Recurso | Uso |
|:--------|:----:|
| 💾 RAM | ~100-150 MB (de 1 GB disponible) |
| 🖥️ CPU | ~1-5% (casi siempre idle) |
| 💽 Disco | ~200 MB (de 30 GB disponibles) |
| 🌐 Red | ~100-500 MB/mes (muy por debajo del límite de 1 GB) |

---

## ⚠️ Lo que NO debes hacer para no pagar

| Acción | Resultado |
|:-------|:----------|
| ❌ Crear VM en región que no sea `us-west1`, `us-central1` o `us-east1` | ❌ Te cobrarán |
| ❌ Usar machine type que no sea `e2-micro` | ❌ Te cobrarán |
| ❌ Agregar disco de más de 30 GB | ❌ Te cobrarán |
| ❌ Crear más de 1 VM | ❌ Te cobrarán por la extra |
| ❌ Dejar que el trial de $300 se active mal | ⚠️ Puede generar cobros |

**Si solo usas lo que te indiqué en esta guía, nunca te cobrarán nada.**

---

## 🔄 Resumen rápido

```bash
# Conectarte por SSH (desde tu PC, después del setup inicial):
gcloud compute ssh nautilus-bot --zone=us-west1-b

# Comandos diarios:
pm2 status
pm2 logs nautilus

# Actualizar bot:
cd ~/nautilus && git pull && pm2 restart nautilus
```

---

## ❓ ¿Olvidaste algo?

| Problema | Solución |
|:---------|:---------|
| No recuerdo la contraseña | Usa SSH desde la consola web de GCP |
| El bot se cayó | `pm2 restart nautilus` |
| Quiero ver logs | `pm2 logs nautilus` |
| La VM se apagó | Google no apaga VMs gratis. Ve a la consola y enciéndela |
| No tengo el token | [discord.dev](https://discord.dev) → Applications → tu app → Bot → Reset Token |

# ☁️ Deploy Carlos en Oracle Cloud "Always Free"

## 1. Crear cuenta en Oracle Cloud

1. Ve a [https://signup.cloud.oracle.com](https://signup.cloud.oracle.com)
2. Registra tu correo, usa una tarjeta de crédito (solo para verificar identidad, **no te cobrarán** si usas Always Free)
3. Verifica tu identidad con SMS o llamada
4. Una vez dentro, busca **"Create a VM instance"**

## 2. Crear la instancia (VM)

- **Nombre:** `nautilus-bot` (o el que quieras)
- **Imagen:** Canónico **Ubuntu 22.04** (o 24.04)
- **Shape:** Selecciona **"Ampere"** (ARM)
  - **Flex shape:** `VM.Standard.A1.Flex`
  - **OCPUs:** 4
  - **Memory:** 24 GB
- **SSH Keys:** Genera un par o sube tu clave pública

> ⚠️ **Tip:** La disponibilidad varía por región. Prueba estas regiones:
> - `us-sanjose-1`
> - `eu-frankfurt-1`
> - `ap-mumbai-1`
> - `us-ashburn-1`

### 2.1 Abrir puerto en firewall de Oracle

1. En la consola de Oracle, ve a **"Virtual Cloud Networks"** > Subnet pública
2. Agrega **Ingress Rules** para:

| Source Type | Source CIDR | IP Protocol | Source Port Range | Destination Port |
|------------|-------------|-------------|-------------------|------------------|
| CIDR | `0.0.0.0/0` | TCP | All | `22` (SSH) |
| CIDR | `0.0.0.0/0` | TCP | All | `443` (HTTPS) |

## 3. Conectarse por SSH

```bash
ssh -i ~/.ssh/tu-clave opc@<IP_DE_TU_INSTANCIA>
```

## 4. Instalar dependencias del sistema

```bash
# Actualizar paquetes
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# FFmpeg (necesario para el sistema de música)
sudo apt install -y ffmpeg

# Dependencias para Puppeteer/Chromium
sudo apt install -y \
  ca-certificates fonts-liberation \
  libappindicator3-1 libasound2 libatk-bridge2.0-0 \
  libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 \
  libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 xdg-utils libgbm1

# Git
sudo apt install -y git

# Build tools (para compilar módulos nativos)
sudo apt install -y build-essential python3

# Verificar versiones
node --version   # debe ser v22.x.x
npm --version
ffmpeg -version
```

## 5. Clonar y configurar el bot

```bash
# Clonar repositorio
cd /opt
sudo mkdir nautilus
sudo chown opc:opc nautilus
git clone https://github.com/tu-usuario/Nautilus.git nautilus
cd nautilus

# Instalar dependencias
npm install

# Crear archivo .env
nano .env
```

Agrega esto al `.env`:

```env
DISCORD_TOKEN=tu_token_aqui
DISCORD_CLIENT_ID=tu_client_id_aqui
API_URL=https://api.nerd.management
API_KEY=tu_api_key
```

Guarda con `Ctrl+O`, `Enter`, `Ctrl+X`.

## 6. Probar el bot manualmente

```bash
# Registrar comandos (una sola vez)
node deploy-commands.js

# Iniciar bot
node index.js
```

Si funciona, detenlo con `Ctrl+C` y pasamos al paso 7.

## 7. Configurar como servicio (systemd)

Para que el bot **se inicie solo** al encender la VM y **se reinicie** si falla:

```bash
sudo nano /etc/systemd/system/nautilus.service
```

Pega esto:

```ini
[Unit]
Description=Carlos Discord Bot
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/nautilus
ExecStart=/usr/bin/node /opt/nautilus/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Guarda y habilita:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nautilus
sudo systemctl start nautilus

# Ver estado
sudo systemctl status nautilus

# Ver logs en vivo
sudo journalctl -u nautilus -f
```

## 8. Comandos útiles

```bash
sudo systemctl status nautilus   # Estado del bot
sudo systemctl restart nautilus  # Reiniciar bot
sudo systemctl stop nautilus     # Detener bot
sudo journalctl -u nautilus -f   # Ver logs en tiempo real
sudo journalctl -u nautilus -n 100   # Últimas 100 líneas de log
```

## 9. Actualizar el bot

```bash
cd /opt/nautilus
git pull
npm install
sudo systemctl restart nautilus
```

## 10. Tips importantes

### ⚡ Mantener la VM despierta
Oracle **NUNCA** apaga las instancias Always Free por inactividad. Pero si no usas la cuenta por 30 días, pueden desactivarla. Tu bot mantiene un WebSocket activo con Discord así que eso no será problema.

### 📊 Monitoreo de recursos
```bash
htop         # Ver CPU/RAM en tiempo real (sudo apt install htop)
df -h        # Ver espacio en disco (tienes 200GB)
```

### 🔄 Actualizaciones automáticas de seguridad
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

### 💰 ¿Te van a cobrar?
**No.** Siempre que uses un shape "Always Free" (VM.Standard.A1.Flex con máximo 4 OCPUs y 24GB), **no te cobrarán nada**. La tarjeta es solo para verificación. Puedes ver tu uso en **"Budgets & Cost"** en el menú de Oracle.

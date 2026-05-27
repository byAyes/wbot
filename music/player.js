const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');
const KazagumoFilter = require('kazagumo-filter');
const { exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let kazagumo = null;

/**
 * Builds the Lavalink node configuration from environment variables
 */
function getLavalinkNodes() {
  const nodes = [
    {
      name: process.env.LAVALINK_NODE_NAME || 'main',
      url: process.env.LAVALINK_HOST || 'localhost:2333',
      auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
      secure: (process.env.LAVALINK_SECURE || 'false') === 'true',
    },
  ];

  // Support multiple nodes via comma-separated env vars
  const extraHosts = process.env.LAVALINK_EXTRA_HOSTS;
  if (extraHosts) {
    const hosts = extraHosts.split(',').map(s => s.trim());
    hosts.forEach((host, i) => {
      nodes.push({
        name: `node-${i + 2}`,
        url: host,
        auth: process.env.LAVALINK_PASSWORD || 'youshallnotpass',
        secure: (process.env.LAVALINK_SECURE || 'false') === 'true',
      });
    });
  }

  return nodes;
}

// ========== LAVALINK AUTO-START ==========

const LAVALINK_DIR = path.join(__dirname, '..', 'lavalink');
const LAVALINK_PORT = 2333;
const LAVALINK_HOST = process.env.LAVALINK_HOST || 'localhost';
const DOCKER_COMPOSE_MAX_WAIT = 60000; // 60 seconds max wait
const DOCKER_COMPOSE_POLL_INTERVAL = 2000; // Poll every 2 seconds

/**
 * Checks if a port is open (Lavalink is ready)
 */
function isPortOpen(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Runs a shell command and returns stdout + error
 */
function runCommand(cmd, cwd) {
  return new Promise((resolve) => {
    exec(cmd, { cwd, timeout: 20000 }, (error, stdout, stderr) => {
      resolve({
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        error,
      });
    });
  });
}

/**
 * Locates the Docker CLI executable on Windows by checking common install paths
 * when it's not available via PATH.
 */
function findDockerPath() {
  const commonPaths = [
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker-compose.exe',
    'C:\\ProgramData\\Docker\\bin\\docker.exe',
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p.replace(/docker(-compose)?\.exe$/, '');
    }
  }
  return null;
}

/**
 * Automatically starts Lavalink via Docker Compose if it's not already running.
 * Handles Windows Docker Desktop paths and missing daemon gracefully.
 */
async function startLavalink() {
  // Step 1: Check if Lavalink is already reachable
  const alreadyRunning = await isPortOpen(
    LAVALINK_HOST === 'localhost' ? '127.0.0.1' : LAVALINK_HOST,
    LAVALINK_PORT,
  );
  if (alreadyRunning) {
    logger.info('Lavalink ya está corriendo. Omitiendo auto-inicio.');
    return true;
  }

  // Step 2: Find Docker executable path
  const dockerDir = findDockerPath();
  const dockerBin = dockerDir ? `"${dockerDir}docker.exe"` : 'docker';

  logger.info('Buscando Docker...');
  const versionCheck = await runCommand(`${dockerBin} version --format "{{.Client.Version}}"`, LAVALINK_DIR);
  if (versionCheck.error) {
    logger.warn(
      'Docker no está disponible. Asegúrate de que Lavalink esté corriendo en localhost:2333 o instala Docker Desktop.',
    );
    logger.warn('Descarga Docker Desktop: https://www.docker.com/products/docker-desktop/');
    return false;
  }

  logger.info(`Docker detectado (v${versionCheck.stdout || '?'}). Verificando daemon...`);

  // Step 3: Check if Docker daemon is running
  const daemonCheck = await runCommand(`${dockerBin} info`, LAVALINK_DIR);
  if (daemonCheck.error) {
    logger.warn('Docker Desktop está instalado pero el daemon NO está corriendo.');
    logger.warn('Ábrelo manualmente: Inicio > Docker Desktop o desde el icono en la bandeja del sistema.');
    logger.warn('También puedes usar: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"');
    return false;
  }

  // Step 4: Check if compose plugin is available
  const composeCheck = await runCommand(`${dockerBin} compose version`, LAVALINK_DIR);
  if (composeCheck.error) {
    logger.warn('Docker está disponible pero Docker Compose no. Usa una versión reciente de Docker Desktop.');
    return false;
  }

  logger.info('Iniciando Lavalink con Docker Compose...');

  // Step 5: Start Lavalink with docker compose up -d
  const startResult = await runCommand(`${dockerBin} compose up -d`, LAVALINK_DIR);
  if (startResult.error) {
    logger.error('Error al iniciar Lavalink:', startResult.stderr || startResult.error.message);
    return false;
  }

  logger.info('Esperando a que Lavalink esté listo...');

  // Step 6: Wait for Lavalink to be ready (poll port)
  const startTime = Date.now();
  while (Date.now() - startTime < DOCKER_COMPOSE_MAX_WAIT) {
    const ready = await isPortOpen('127.0.0.1', LAVALINK_PORT);
    if (ready) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      logger.success(`Lavalink listo después de ${elapsed}s`);
      return true;
    }
    await new Promise(r => setTimeout(r, DOCKER_COMPOSE_POLL_INTERVAL));
  }

  // Show logs if Lavalink failed to start
  const logs = await runCommand(`${dockerBin} compose logs --tail 20`, LAVALINK_DIR);
  logger.error(
    `Lavalink no respondió después de ${DOCKER_COMPOSE_MAX_WAIT / 1000}s.
` +
    `Últimos logs:\n${logs.stdout || logs.stderr || '(sin logs)'}\n` +
    `Verifica el estado con: cd lavalink && docker compose ps`,
  );
  return false;
}

// ========== KAZAGUMO INIT ==========

/**
 * Initializes the Kazagumo/Lavalink music system
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<Kazagumo>} - The initialized Kazagumo instance
 */
async function initPlayer(client) {
  if (kazagumo) return kazagumo;

  logger.info('Inicializando sistema de música Kazagumo + Lavalink...');

  // Auto-start Lavalink if needed
  await startLavalink();

  const lavalinkNodes = getLavalinkNodes();

  kazagumo = new Kazagumo(
    {
      plugins: [new KazagumoFilter()],
      defaultVolume: 50,
      leaveOnEmpty: {
        enabled: true,
        cooldown: 300000, // 5 minutes
      },
      leaveOnEnd: {
        enabled: true,
        cooldown: 300000,
      },
    },
    new Connectors.DiscordJS(client),
    lavalinkNodes,
    {
      defaultVolume: 50,
      moveOnDisconnect: true,
      resumable: true,
      resumeTimeout: 30,
      reconnectTries: 5,
      reconnectInterval: 5000,
    },
  );

  // ========== EVENTS ==========

  // When a track starts playing
  kazagumo.on('playerStart', (player, track) => {
    const data = player.data;
    if (data && typeof data.channel?.send === 'function') {
      const sourceIcon = getTrackIcon(track);
      try {
        data.channel.send({
          content: `${sourceIcon} **${track.title}** - *${track.author}* (${player.queue.length} en cola)`,
        }).catch(() => {});
      } catch {
        // ignore
      }
    }
  });

  // When a track ends
  kazagumo.on('playerEnd', (_player, track) => {
    logger.debug(`Track ended: ${track.title}`);
  });

  // When the queue is empty
  kazagumo.on('queueEnd', (player) => {
    const data = player.data;
    if (data && typeof data.channel?.send === 'function') {
      data.channel.send('📭 La cola ha terminado. Añade más canciones con `/play`.').catch(() => {});
    }
  });

  // When all users leave the channel
  kazagumo.on('playerEmpty', (player) => {
    const data = player.data;
    if (data && typeof data.channel?.send === 'function') {
      data.channel.send('👋 Todos se fueron del canal. Saliendo...').catch(() => {});
    }
  });

  // When a player error occurs
  kazagumo.on('playerError', (player, error, track) => {
    logger.error('Player playback error:', error.message);
    const data = player.data;
    if (data && typeof data.channel?.send === 'function') {
      data.channel.send(`❌ Error al reproducir **${track?.title || 'canción'}**: ${error.message}`).catch(() => {});
    }
  });

  // When a player is resumed (reconnection)
  kazagumo.on('playerResumed', (player) => {
    logger.debug(`Player resumed in guild ${player.guildId}`);
  });

  // Lavalink node events
  kazagumo.shoukaku.on('ready', (name, resumed) => {
    logger.success(`Lavalink node "${name}" listo${resumed ? ' (reconectado)' : ''}`);
  });

  kazagumo.shoukaku.on('error', (name, error) => {
    logger.error(`Lavalink node "${name}" error:`, error.message);
  });

  kazagumo.shoukaku.on('close', (name, code, reason) => {
    logger.warn(`Lavalink node "${name}" cerrado: código=${code} motivo=${reason || 'desconocido'}`);
  });

  kazagumo.shoukaku.on('disconnected', (name, playersMoved) => {
    logger.warn(`Lavalink node "${name}" desconectado. Players movidos: ${playersMoved}`);
  });

  logger.success('Sistema de música Kazagumo + Lavalink inicializado');
  return kazagumo;
}

/**
 * Gets the Kazagumo instance
 * @returns {Kazagumo|null}
 */
function getKazagumo() {
  return kazagumo;
}

/**
 * Gets the player for a guild
 * @param {string} guildId - The guild ID
 * @returns {import('kazagumo').KazagumoPlayer|null}
 */
function getPlayer(guildId) {
  if (!kazagumo) return null;
  return kazagumo.players.get(guildId);
}

/**
 * Gets the queue/player for a guild (compatible with validateQueue)
 * Returns null if no player or not playing
 * @param {string} guildId - The guild ID
 * @returns {import('kazagumo').KazagumoPlayer|null}
 */
function getQueue(guildId) {
  const player = getPlayer(guildId);
  if (!player || !player.playing) return null;
  return player;
}

/**
 * Gets the icon emoji for a track based on its source
 * @param {import('kazagumo').KazagumoTrack} track
 * @returns {string}
 */
function getTrackIcon(track) {
  if (!track) return '🎵';
  const uri = track.uri || '';
  const sourceName = track.sourceName || '';
  if (sourceName.includes('spotify') || uri.includes('spotify')) return '🎵';
  if (sourceName.includes('soundcloud') || uri.includes('soundcloud')) return '☁️';
  if (sourceName.includes('apple') || uri.includes('apple')) return '🍎';
  if (sourceName.includes('deezer') || uri.includes('deezer')) return '📻';
  return '▶️';
}

module.exports = {
  initPlayer,
  getKazagumo,
  getPlayer,
  getQueue,
  getTrackIcon,
};

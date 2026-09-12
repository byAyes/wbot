const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');
const { exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

let kazagumo = null;
let discordClient = null;
const emptyVoiceTimers = new Map();

const FILTER_PRESETS = {
  bassboost_low: {
    equalizer: [
      { band: 0, gain: 0.08 },
      { band: 1, gain: 0.08 },
      { band: 2, gain: 0.05 },
    ],
  },
  bassboost: {
    equalizer: [
      { band: 0, gain: 0.15 },
      { band: 1, gain: 0.15 },
      { band: 2, gain: 0.10 },
      { band: 3, gain: 0.05 },
    ],
  },
  bassboost_high: {
    equalizer: [
      { band: 0, gain: 0.25 },
      { band: 1, gain: 0.25 },
      { band: 2, gain: 0.15 },
      { band: 3, gain: 0.10 },
    ],
  },
  '8D': { rotation: { rotationHz: 0.2 } },
  vaporwave: {
    equalizer: [
      { band: 0, gain: 0.3 },
      { band: 1, gain: 0.3 },
    ],
    timescale: { pitch: 0.5 },
    tremolo: { depth: 0.3, frequency: 14 },
  },
  nightcore: { timescale: { speed: 1.3, pitch: 1.3 } },
  phaser: { rotation: { rotationHz: 0.12 }, vibrato: { depth: 0.2, frequency: 8 } },
  tremolo: { tremolo: { depth: 0.3, frequency: 14 } },
  vibrato: { vibrato: { depth: 0.3, frequency: 14 } },
  reverse: { timescale: { speed: 0.95, pitch: 0.95 } },
  treble: {
    equalizer: [
      { band: 8, gain: 0.2 },
      { band: 9, gain: 0.25 },
      { band: 10, gain: 0.25 },
      { band: 11, gain: 0.2 },
      { band: 12, gain: 0.15 },
    ],
  },
  normalizer: { lowPass: { smoothing: 10 } },
  surrounding: { channelMix: { leftToLeft: 0.55, leftToRight: 0.45, rightToLeft: 0.45, rightToRight: 0.55 } },
  subboost: {
    equalizer: [
      { band: 0, gain: 0.2 },
      { band: 1, gain: 0.18 },
      { band: 2, gain: 0.12 },
    ],
  },
  karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
  flanger: { rotation: { rotationHz: 0.08 }, tremolo: { depth: 0.2, frequency: 6 } },
  compressor: { lowPass: { smoothing: 18 } },
  lofi: {
    equalizer: [
      { band: 0, gain: 0.15 },
      { band: 1, gain: 0.10 },
      { band: 8, gain: -0.15 },
      { band: 9, gain: -0.20 },
    ],
    timescale: { speed: 0.95, pitch: 0.95 },
  },
  earrape: {
    equalizer: [
      { band: 0, gain: 0.25 },
      { band: 1, gain: 0.5 },
      { band: 2, gain: -0.5 },
      { band: 12, gain: 0.375 },
      { band: 13, gain: 0.125 },
    ],
  },
  mono: { channelMix: { leftToLeft: 0.5, leftToRight: 0.5, rightToLeft: 0.5, rightToRight: 0.5 } },
};

const CLEAR_FILTERS = {
  volume: 1,
  equalizer: [],
  karaoke: null,
  timescale: null,
  tremolo: null,
  vibrato: null,
  rotation: null,
  distortion: null,
  channelMix: null,
  lowPass: null,
};

function mergeFilterPresets(enabledPresets) {
  return enabledPresets.reduce((filters, presetName) => ({
    ...filters,
    ...FILTER_PRESETS[presetName],
  }), {});
}

function applyPlayerCompatibility(player) {
  if (!player || player.__wbotCompatApplied) return player;

  Object.defineProperty(player, 'currentTrack', {
    configurable: true,
    get() {
      return this.queue.current;
    },
  });

  const originalPause = player.pause.bind(player);
  player.pause = (pause = true) => originalPause(pause);
  player.resume = () => originalPause(false);

  const originalSetLoop = player.setLoop.bind(player);
  player.setLoop = (mode) => {
    const modeMap = {
      0: 'none',
      1: 'track',
      2: 'queue',
      off: 'none',
    };
    return originalSetLoop(modeMap[mode] || mode);
  };

  player.filterManager = {
    enabledPresets: [],
    setPreset: async (presetName) => {
      if (!FILTER_PRESETS[presetName]) {
        throw new Error(`Filtro no soportado: ${presetName}`);
      }

      const enabled = player.filterManager.enabledPresets;
      const index = enabled.indexOf(presetName);
      if (index >= 0) {
        enabled.splice(index, 1);
      } else {
        enabled.push(presetName);
      }

      await player.shoukaku.setFilters({
        ...CLEAR_FILTERS,
        ...mergeFilterPresets(enabled),
      });

      return player;
    },
    clear: async () => {
      player.filterManager.enabledPresets = [];
      await player.shoukaku.setFilters(CLEAR_FILTERS);
      return player;
    },
  };

  player.__wbotCompatApplied = true;
  return player;
}

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
const DOCKER_COMPOSE_MAX_WAIT = 120000; // 2 minutes max wait (includes Docker Desktop startup)
const DOCKER_DAEMON_WAIT = 120000; // 2 minutes to wait for Docker daemon
const DOCKER_COMPOSE_POLL_INTERVAL = 2000; // Poll every 2 seconds
const NODE_READY_WAIT = 30000; // Wait up to 30 seconds for Shoukaku to mark a node online

const DOCKER_DESKTOP_PATHS = [
  'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
];

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
 * Returns true when Shoukaku has at least one connected Lavalink node.
 */
function hasOnlineNodes() {
  if (!kazagumo?.shoukaku?.nodes) return false;
  return [...kazagumo.shoukaku.nodes.values()].some(node => node.state === 1);
}

function ensureShoukakuUserId() {
  const userId = discordClient?.user?.id;
  if (!kazagumo?.shoukaku || !userId) return false;

  if (!kazagumo.shoukaku.id) {
    kazagumo.shoukaku.id = userId;
  }

  return true;
}

function ensureNodesRegistered() {
  if (!kazagumo) return;
  if (!ensureShoukakuUserId()) {
    logger.warn('Lavalink todavia no puede conectar: Discord client.user.id no esta listo.');
    return;
  }

  for (const node of getLavalinkNodes()) {
    if (!kazagumo.shoukaku.nodes.has(node.name)) {
      logger.warn(`Registrando de nuevo el nodo Lavalink "${node.name}"...`);
      kazagumo.shoukaku.addNode(node);
    }
  }
}

/**
 * Waits until at least one Lavalink node is online.
 */
function waitForNodesOnline(timeout = NODE_READY_WAIT) {
  if (!kazagumo) {
    return Promise.reject(new Error('Kazagumo no está inicializado'));
  }

  ensureNodesRegistered();
  if (hasOnlineNodes()) return Promise.resolve(true);

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const cleanup = () => {
      clearInterval(interval);
      clearTimeout(timer);
      kazagumo.shoukaku.off('ready', onReady);
    };
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const interval = setInterval(() => {
      if (hasOnlineNodes()) {
        cleanup();
        resolve(true);
      }
    }, 500);
    const timer = setTimeout(() => {
      cleanup();
      const nodeStates = [...kazagumo.shoukaku.nodes.values()]
        .map(node => `${node.name}:${node.state}`)
        .join(', ') || 'sin nodos registrados';
      reject(new Error(`No hay nodos Lavalink online después de ${Math.round((Date.now() - startedAt) / 1000)}s (${nodeStates})`));
    }, timeout);

    kazagumo.shoukaku.on('ready', onReady);
  });
}

async function ensureKazagumoReady(timeout = NODE_READY_WAIT) {
  if (!kazagumo) {
    throw new Error('El sistema de música no está inicializado');
  }

  await startLavalink();
  ensureNodesRegistered();
  await waitForNodesOnline(timeout);
  return kazagumo;
}

async function destroyPlayerSafely(guildId, reason = 'sin razón') {
  if (!kazagumo) return;
  clearEmptyVoiceTimer(guildId);

  const player = kazagumo.players.get(guildId);
  if (player) {
    try {
      await player.destroy();
    } catch (error) {
      logger.warn(`No se pudo destruir el player de ${guildId} (${reason}): ${error.message}`);
      try {
        await kazagumo.shoukaku.leaveVoiceChannel(guildId);
      } catch (leaveError) {
        logger.warn(`No se pudo salir del canal de voz de ${guildId}: ${leaveError.message}`);
      }
    }
  }

  kazagumo.players.delete(guildId);
  kazagumo.shoukaku.players.delete(guildId);
  kazagumo.shoukaku.connections.delete(guildId);
}

async function getOrCreateMusicPlayer(interaction, voiceChannel, options = {}) {
  await ensureKazagumoReady(options.nodeTimeout || 15000);

  const guildId = interaction.guildId;
  const existing = applyPlayerCompatibility(kazagumo.players.get(guildId));
  const existingNodeOnline = existing?.shoukaku?.node?.state === 1;
  const staleVoice = existing && existing.voiceId && existing.voiceId !== voiceChannel.id;
  const staleNode = existing && !existingNodeOnline;
  const staleConnection = existing && !kazagumo.shoukaku.connections.has(guildId);

  if (staleVoice || staleNode || staleConnection) {
    const reason = staleVoice
      ? `cambio de canal ${existing.voiceId} -> ${voiceChannel.id}`
      : staleNode
        ? 'nodo desconectado'
        : 'conexión de voz ausente';
    await destroyPlayerSafely(guildId, reason);
  }

  let player = applyPlayerCompatibility(kazagumo.players.get(guildId));
  if (!player) {
    player = applyPlayerCompatibility(await kazagumo.createPlayer({
      guildId,
      textId: interaction.channelId,
      voiceId: voiceChannel.id,
      shardId: interaction.guild?.shardId || 0,
      deaf: true,
      mute: false,
      volume: 100,
    }));
  } else {
    player.setTextChannel(interaction.channelId);
  }

  player.data = { channel: interaction.channel };
  if (player.volume !== 50) await player.setVolume(50);
  return player;
}

async function queueTracksForPlayback(interaction, voiceChannel, tracks, options = {}) {
  const player = await getOrCreateMusicPlayer(interaction, voiceChannel, options);
  const normalizedTracks = Array.isArray(tracks) ? tracks.filter(Boolean) : [tracks].filter(Boolean);

  if (!normalizedTracks.length) {
    throw new Error('No hay canciones válidas para reproducir');
  }

  player.queue.add(normalizedTracks);

  if (!player.playing && !player.paused) {
    await player.play();
  }

  return player;
}

function getPlayerTextChannel(player) {
  const dataChannel = player?.data?.channel;
  if (dataChannel && typeof dataChannel.send === 'function') return dataChannel;

  const textId = player?.textId;
  if (!textId || !discordClient) return null;
  return discordClient.channels.cache.get(textId) || null;
}

function sendPlayerMessage(player, content) {
  const channel = getPlayerTextChannel(player);
  if (!channel || typeof channel.send !== 'function') return;
  channel.send(content).catch(() => {});
}

function sendDiscordVoicePacket(guildId, payload) {
  const guild = discordClient?.guilds.cache.get(guildId);
  const shard = guild?.shard || discordClient?.ws.shards.get(guild?.shardId || 0);
  if (!shard || typeof shard.send !== 'function') {
    logger.warn(`No se pudo enviar VOICE_STATE_UPDATE para guild ${guildId}: shard no disponible.`);
    return false;
  }

  shard.send(payload);
  return true;
}

function getPlayerVoiceChannel(player) {
  if (!discordClient || !player?.guildId || !player?.voiceId) return null;
  const guild = discordClient.guilds.cache.get(player.guildId);
  return guild?.channels.cache.get(player.voiceId) || null;
}

function hasHumanListeners(player) {
  const voiceChannel = getPlayerVoiceChannel(player);
  if (!voiceChannel?.members) return true;
  return voiceChannel.members.some(member => !member.user.bot);
}

function clearEmptyVoiceTimer(guildId) {
  const timer = emptyVoiceTimers.get(guildId);
  if (!timer) return;
  clearTimeout(timer);
  emptyVoiceTimers.delete(guildId);
}

function scheduleEmptyVoiceLeave(player) {
  if (!player?.guildId || emptyVoiceTimers.has(player.guildId)) return;

  sendPlayerMessage(player, '👋 Todos se fueron del canal. Saliendo...');

  const timer = setTimeout(async () => {
    emptyVoiceTimers.delete(player.guildId);
    const currentPlayer = kazagumo?.players.get(player.guildId);
    if (!currentPlayer || hasHumanListeners(currentPlayer)) return;
    await destroyPlayerSafely(player.guildId, 'canal de voz vacio');
  }, 5000);

  emptyVoiceTimers.set(player.guildId, timer);
}

function handleVoiceStateUpdate(oldState, newState) {
  if (!kazagumo) return;

  const guildId = oldState.guild?.id || newState.guild?.id;
  const player = kazagumo.players.get(guildId);
  if (!player) return;

  const oldChannelId = oldState.channelId || oldState.channel?.id;
  const newChannelId = newState.channelId || newState.channel?.id;
  if (oldChannelId !== player.voiceId && newChannelId !== player.voiceId) return;

  if (hasHumanListeners(player)) {
    clearEmptyVoiceTimer(guildId);
    return;
  }

  scheduleEmptyVoiceLeave(player);
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
 * Finds the Docker Desktop executable path.
 */
function findDockerDesktopPath() {
  for (const p of DOCKER_DESKTOP_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Spawns Docker Desktop and waits for the daemon to become ready.
 */
function startDockerDaemon(dockerBin) {
  return new Promise((resolve) => {
    const ddPath = findDockerDesktopPath();
    if (!ddPath) {
      logger.warn('Docker Desktop no encontrado. Inícialo manualmente.');
      return resolve(false);
    }

    logger.info('Iniciando Docker Desktop automáticamente...');

    // Launch Docker Desktop (detached — we don't wait for the process)
    const proc = exec(`"${ddPath}"`, (err) => {
      if (err && err.code !== 0) {
        // Docker Desktop may already be launching; that's fine
        logger.debug(`Docker Desktop launch: ${err.message}`);
      }
    });
    proc.unref(); // Don't keep the bot alive just for this process

    // Poll until daemon is ready
    const startTime = Date.now();
    const poll = setInterval(async () => {
      const result = await runCommand(`${dockerBin} info`, LAVALINK_DIR);
      if (!result.error) {
        clearInterval(poll);
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        logger.success(`Docker Desktop listo después de ${elapsed}s`);
        resolve(true);
        return;
      }

      if (Date.now() - startTime > DOCKER_DAEMON_WAIT) {
        clearInterval(poll);
        logger.warn(`Docker Desktop no respondió después de ${DOCKER_DAEMON_WAIT / 1000}s.`);
        logger.warn('Ábrelo manualmente: Inicio > Docker Desktop');
        resolve(false);
      }
    }, DOCKER_COMPOSE_POLL_INTERVAL);
  });
}

/**
 * Automatically starts Lavalink via Docker Compose if it's not already running.
 * Handles everything: starts Docker Desktop if needed, then Lavalink.
 * The user only needs to run the bot — no manual steps.
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

  logger.info('Verificando Docker...');
  const versionCheck = await runCommand(`${dockerBin} version --format "{{.Client.Version}}"`, LAVALINK_DIR);
  if (versionCheck.error) {
    logger.warn(
      'Docker no está instalado. El sistema de música no estará disponible sin Lavalink.',
    );
    logger.info('Descarga Docker Desktop desde: https://www.docker.com/products/docker-desktop/');
    return false;
  }

  logger.info(`Docker v${versionCheck.stdout || '?'} detectado.`);

  // Step 3: Check if Docker daemon is running — if not, auto-start Docker Desktop
  const daemonCheck = await runCommand(`${dockerBin} info`, LAVALINK_DIR);
  if (daemonCheck.error) {
    logger.info('El daemon de Docker no está corriendo. Intentando iniciar Docker Desktop...');
    const started = await startDockerDaemon(dockerBin);
    if (!started) {
      return false;
    }
  }

  // Step 4: Check if compose plugin is available
  const composeCheck = await runCommand(`${dockerBin} compose version`, LAVALINK_DIR);
  if (composeCheck.error) {
    logger.warn('Docker Compose no está disponible. Actualiza Docker Desktop.');
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

  // Step 6: Wait for Lavalink to be ready (poll port 2333)
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
    `Últimos logs:\n${logs.stdout || logs.stderr || '(sin logs)'}\n`,
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
  discordClient = client;
  if (kazagumo) return kazagumo;

  logger.info('Inicializando sistema de música Kazagumo + Lavalink...');

  // Auto-start Lavalink if needed
  await startLavalink();

  const lavalinkNodes = getLavalinkNodes();

  kazagumo = new Kazagumo(
    {
      plugins: [],
      defaultVolume: 50,
      leaveOnEmpty: {
        enabled: true,
        cooldown: 300000, // 5 minutes
      },
      leaveOnEnd: {
        enabled: true,
        cooldown: 300000,
      },
      send: sendDiscordVoicePacket,
    },
    new Connectors.DiscordJS(client),
    lavalinkNodes,
    {
      defaultVolume: 50,
      moveOnDisconnect: true,
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 5,
      reconnectInterval: 5000,
    },
  );

  ensureShoukakuUserId();
  client.on('voiceStateUpdate', handleVoiceStateUpdate);

  // ========== EVENTS ==========

  // When a track starts playing
  kazagumo.on('playerStart', (player, track) => {
    const sourceIcon = getTrackIcon(track);
    const title = track?.title || 'Canción desconocida';
    const author = track?.author || 'Autor desconocido';
    try {
      sendPlayerMessage(player, {
        content: `${sourceIcon} **${title}** - *${author}* (${player.queue.length} en cola)`,
      });
    } catch {
      // ignore
    }
  });

  // When a track ends
  kazagumo.on('playerEnd', (player, track) => {
    const title = track?.title || player?.queue?.previous?.[0]?.title || 'desconocida';
    logger.debug(`Track ended: ${title}`);
  });

  // When the queue is empty
  kazagumo.on('queueEnd', (player) => {
    sendPlayerMessage(player, '📭 La cola ha terminado. Añade más canciones con `/play`.');
  });

  // When the queue runs out
  kazagumo.on('playerEmpty', (player) => {
    sendPlayerMessage(player, '📭 La cola ha terminado. Añade más canciones con `/play`.');
  });

  // When a player error occurs
  kazagumo.on('playerError', (player, error, track) => {
    logger.error('Player playback error:', error.message);
    sendPlayerMessage(player, `❌ Error al reproducir **${track?.title || 'canción'}**: ${error.message}`);
  });

  kazagumo.on('playerResolveError', (player, track, message) => {
    const title = track?.title || 'canción';
    logger.error(`Player resolve error (${title}): ${message || 'sin detalle'}`);
    sendPlayerMessage(player, `❌ No pude resolver **${title}**. Probando la siguiente canción si hay cola.`);
  });

  kazagumo.on('playerException', (player, data) => {
    const message = data?.exception?.message || data?.error || 'Error desconocido de Lavalink';
    logger.error(`Player exception: ${message}`);
    sendPlayerMessage(player, `❌ Lavalink no pudo reproducir esa canción: ${message}`);
  });

  kazagumo.on('playerStuck', (player, data) => {
    logger.warn(`Player stuck in guild ${player.guildId}: ${data?.thresholdMs || 'unknown'}ms`);
    sendPlayerMessage(player, '⚠️ La reproducción se quedó atascada. Saltando a la siguiente canción...');
    try {
      player.skip();
    } catch {
      // ignore
    }
  });

  kazagumo.on('playerClosed', (player, data) => {
    logger.warn(`Player closed in guild ${player.guildId}: código=${data?.code || 'desconocido'} motivo=${data?.reason || 'desconocido'}`);
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
    setTimeout(() => {
      try {
        ensureNodesRegistered();
      } catch (error) {
        logger.warn(`No se pudo registrar de nuevo el nodo "${name}": ${error.message}`);
      }
    }, 3000);
  });

  logger.success('Sistema de música Kazagumo + Lavalink preparado');
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
  return applyPlayerCompatibility(kazagumo.players.get(guildId));
}

/**
 * Gets the queue/player for a guild (compatible with validateQueue)
 * Returns null if no player or not playing
 * @param {string} guildId - The guild ID
 * @returns {import('kazagumo').KazagumoPlayer|null}
 */
function getQueue(guildId) {
  const player = getPlayer(guildId);
  if (!player || (!player.playing && !player.paused && !player.queue?.current && !player.queue?.length)) return null;
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
  hasOnlineNodes,
  waitForNodesOnline,
  applyPlayerCompatibility,
  ensureKazagumoReady,
  getOrCreateMusicPlayer,
  queueTracksForPlayback,
  destroyPlayerSafely,
};

const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');
const KazagumoFilter = require('kazagumo-filter');
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

/**
 * Initializes the Kazagumo/Lavalink music system
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<Kazagumo>} - The initialized Kazagumo instance
 */
async function initPlayer(client) {
  if (kazagumo) return kazagumo;

  logger.info('Inicializando sistema de música Kazagumo + Lavalink...');

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

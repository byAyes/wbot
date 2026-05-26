const { Player } = require('discord-player');
const { YoutubeExtractor } = require('@distube/yt-dlp');
const logger = require('../utils/logger');

let player = null;

/**
 * Initializes the Discord Player with yt-dlp extractors
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<Player>} - The initialized Player instance
 */
async function initPlayer(client) {
  if (player) return player;

  player = new Player(client, {
    ytdlOptions: {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25, // 32MB
    },
    skipFFmpeg: false,
    connectionTimeout: 30000,
  });

  // Register extractors
  logger.info('Registering music extractors...');
  await player.extractors.register(YoutubeExtractor, {
    createFFmpegStream: true,
  });

  // Player event handlers
  player.events.on('playerError', (queue, error) => {
    logger.error('Player playback error:', error.message);
    const metadata = queue.metadata;
    if (metadata && typeof metadata.followUp === 'function') {
      metadata.followUp({ content: `❌ Error de reproducción: ${error.message}`, ephemeral: true }).catch(() => {});
    }
  });

  player.events.on('error', (queue, error) => {
    logger.error('Queue error:', error.message);
  });

  player.events.on('emptyQueue', (queue) => {
    const metadata = queue.metadata;
    if (metadata && typeof metadata.channel?.send === 'function') {
      metadata.channel.send('📭 La cola ha terminado. Añade más canciones con `/music play`.').catch(() => {});
    }
  });

  player.events.on('emptyChannel', (queue) => {
    const metadata = queue.metadata;
    if (metadata && typeof metadata.channel?.send === 'function') {
      metadata.channel.send('👋 Todos se fueron. Saliendo del canal de voz...').catch(() => {});
    }
  });

  logger.info('Music system ready (yt-dlp extractor)');
  return player;
}

/**
 * Gets the queue for a guild
 * @param {string} guildId - The guild ID
 * @returns {import('discord-player').GuildQueue|null}
 */
function getQueue(guildId) {
  if (!player) return null;
  return player.nodes.get(guildId);
}

module.exports = {
  initPlayer,
  getQueue,
};

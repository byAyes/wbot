const { Player } = require('discord-player');
const { YoutubeExtractor } = require('@distube/yt-dlp');
const {
  DefaultExtractors,
  SpotifyExtractor,
  SoundCloudExtractor,
  AppleMusicExtractor,
} = require('@discord-player/extractor');
const logger = require('../utils/logger');

let player = null;

/**
 * Initializes the Discord Player with all extractors
 * @param {import('discord.js').Client} client - The Discord client
 * @returns {Promise<Player>} - The initialized Player instance
 */
async function initPlayer(client) {
  if (player) return player;

  player = new Player(client, {
    skipFFmpeg: false,
    connectionTimeout: 30000,
    lagMonitor: 1000,
  });

  // Register extractors
  logger.info('Registering music extractors...');

  // 1. Register DefaultExtractors bundle (Spotify, SoundCloud, Apple Music, Vimeo, etc.)
  // Spotify works anonymously (no credentials needed) but you can also set them via env vars
  await player.extractors.loadMulti(DefaultExtractors, {
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID || null,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
    },
    soundcloud: {},
    appleMusic: {},
  });

  // 2. Register YouTube extractor (uses yt-dlp)
  await player.extractors.register(YoutubeExtractor, {
    createFFmpegStream: true,
  });

  logger.success(`Extractores registrados: ${player.extractors.size}`);

  // --- Queue Events ---

  player.events.on('connection', (queue) => {
    logger.debug(`Conectado al canal de voz en ${queue.guild.name}`);
  });

  player.events.on('disconnect', (queue) => {
    logger.debug(`Desconectado del canal de voz en ${queue.guild.name}`);
  });

  player.events.on('playerStart', (queue, track) => {
    const metadata = queue.metadata;
    // Solo enviamos notificación si NO viene de un comando interactivo
    // (cuando es auto-avance por skip, fin de canción o autoplay)
    if (metadata && typeof metadata.channel?.send === 'function') {
      // Si el metadata es una interacción, ya mostró el embed en el comando
      if (metadata.reply && metadata.editReply) return;

      const sourceIcon = { youtube: '▶️', spotify: '🎵', soundcloud: '☁️', apple_music: '🍎', deezer: '📻' }[track.source] || '🎵';
      try {
        metadata.channel.send({
          content: `${sourceIcon} **${track.title}** - *${track.author}* (${queue.tracks.size} en cola)`,
        }).catch(() => {});
      } catch {
        // ignore
      }
    }
  });

  player.events.on('playerError', (queue, error, track) => {
    logger.error('Player playback error:', error.message);
    const metadata = queue.metadata;
    if (metadata && typeof metadata.channel?.send === 'function') {
      metadata.channel.send(`❌ Error al reproducir **${track.title}**: ${error.message}`).catch(() => {});
    }
  });

  player.events.on('error', (queue, error) => {
    logger.error('Queue error:', error.message);
  });

  player.events.on('emptyQueue', (queue) => {
    const metadata = queue.metadata;
    if (metadata && typeof metadata.channel?.send === 'function') {
      const repeatMode = queue.repeatMode;
      if (repeatMode === 3) {
        // Autoplay is on, don't send empty queue message
        return;
      }
      metadata.channel.send('📭 La cola ha terminado. Añade más canciones con `/play`.').catch(() => {});
    }
  });

  player.events.on('emptyChannel', (queue) => {
    const metadata = queue.metadata;
    if (metadata && typeof metadata.channel?.send === 'function') {
      metadata.channel.send('👋 Todos se fueron del canal. Saliendo...').catch(() => {});
    }
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    logger.debug(`Track añadido a la cola: ${track.title}`);
  });

  player.events.on('audioTracksAdd', (queue, tracks) => {
    logger.debug(`${tracks.length} tracks añadidos a la cola`);
  });

  logger.success('Sistema de música listo (YouTube, Spotify, SoundCloud, Apple Music)');
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

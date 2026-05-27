const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { json } = require('@distube/yt-dlp');
const axios = require('axios');
const { getQueue, getPlayer, getKazagumo } = require('./player');
const logger = require('../utils/logger');

// ========== CONSTANTS ==========

const YTDLP_FLAGS = {
  dumpSingleJson: true,
  noWarnings: true,
  noCallHome: true,
  skipDownload: true,
  simulate: true,
};

const FILTER_NAMES = {
  bassboost_low: '🎵 Bass Boost (Bajo)',
  bassboost: '🎵 Bass Boost',
  bassboost_high: '🎵 Bass Boost (Alto)',
  '8D': '🌀 8D',
  vaporwave: '🌊 Vaporwave',
  nightcore: '⚡ Nightcore',
  phaser: '🌐 Phaser',
  tremolo: '📳 Tremolo',
  vibrato: '🎸 Vibrato',
  reverse: '🔙 Reverse',
  treble: '🔊 Treble',
  normalizer: '📈 Normalizer',
  surrounding: '🔊 Surround',
  subboost: '🔊 Sub Boost',
  karaoke: '🎤 Karaoke',
  flanger: '🌀 Flanger',
  compressor: '📉 Compresor',
  lofi: '☕ Lo-Fi',
  earrape: '💥 Earrape',
  pulsator: '💫 Pulsator',
  gate: '🚪 Gate',
  haas: '🔊 Haas',
  mono: '🎛️ Mono',
};

// ========== FORMAT HELPERS ==========

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'En vivo';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDurationMs(ms) {
  if (!ms || isNaN(ms)) return 'Desconocida';
  return formatDuration(Math.floor(ms / 1000));
}

function formatRepeatMode(mode) {
  switch (mode) {
    case 0: return '❌ Desactivado';
    case 1: return '🔂 Canción';
    case 2: return '🔁 Cola';
    default: return '❌ Desactivado';
  }
}

// ========== URL DETECTORS ==========

function extractYouTubeID(text) {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

function extractSpotifyID(text) {
  const match = text.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function extractDeezerID(text) {
  const match = text.match(/deezer\.com\/track\/(\d+)/);
  return match ? match[1] : null;
}

function isSoundCloudUrl(text) {
  return /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\//.test(text);
}

// ========== SOURCE ICON ==========

function getSourceIcon(track) {
  if (!track) return '🎵';
  const uri = track.uri || '';
  if (uri.includes('spotify')) return '🎵';
  if (uri.includes('soundcloud')) return '☁️';
  if (uri.includes('apple')) return '🍎';
  if (uri.includes('deezer')) return '📻';
  return '▶️';
}

/**
 * Gets the active filter names from a Kazagumo player
 * @param {import('kazagumo').KazagumoPlayer} player
 * @returns {string[]}
 */
function getActiveFilters(player) {
  if (!player.filterManager?.enabledPresets) return [];
  const presets = player.filterManager.enabledPresets;
  if (!Array.isArray(presets)) return [];
  return presets.filter(f => FILTER_NAMES[f]);
}

/**
 * Constructs a thumbnail URL for a track
 * @param {import('kazagumo').KazagumoTrack} track
 * @returns {string|null}
 */
function getTrackThumbnail(track) {
  if (track.thumbnail) return track.thumbnail;
  if (track.identifier && track.uri?.includes('youtu')) {
    return `https://img.youtube.com/vi/${track.identifier}/mqdefault.jpg`;
  }
  return null;
}

// ========== PROGRESS BAR ==========

function createProgressBar(currentMs, totalMs, length = 15) {
  if (!totalMs || totalMs <= 0 || !currentMs || currentMs < 0) {
    return '**[ ⏹️ En vivo ]**';
  }
  const progress = Math.min(currentMs / totalMs, 1);
  const filled = Math.round(progress * length);
  const empty = length - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const currentStr = formatDurationMs(currentMs);
  const totalStr = formatDurationMs(totalMs);
  return `${currentStr} ${bar} ${totalStr}`;
}

// ========== EMBED BUILDERS ==========

function createNowPlayingEmbed(player, track) {
  const progress = createProgressBar(player.position, track.length);
  const activeFilters = getActiveFilters(player);
  const sourceIcon = getSourceIcon(track);
  const thumbnail = getTrackThumbnail(track);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${sourceIcon} Reproduciendo ahora`)
    .setDescription(`**[${track.title}](${track.uri})**\nPor **${track.author}**`)
    .addFields(
      { name: '⏳ Duración', value: formatDurationMs(track.length), inline: true },
      { name: '👤 Solicitado por', value: `${track.requester}`, inline: true },
      { name: '📋 En cola', value: `${player.queue.length} canciones`, inline: true },
    );

  if (track.length > 0) {
    embed.addFields({ name: '▶️ Progreso', value: progress, inline: false });
  }

  const repeatLabel = formatRepeatMode(player.loop || 0);
  embed.addFields({ name: '🔁 Modo repetición', value: repeatLabel, inline: true });

  embed.addFields({ name: '🔊 Volumen', value: `${player.volume}%`, inline: true });

  if (activeFilters.length > 0) {
    embed.addFields({
      name: '🎛️ Filtros activos',
      value: activeFilters.map(f => FILTER_NAMES[f] || f).join(', '),
      inline: false,
    });
  }

  if (thumbnail) embed.setThumbnail(thumbnail);
  embed.setFooter({ text: `Fuente: ${track.sourceName || 'desconocida'}` });
  embed.setTimestamp();
  return embed;
}

function createQueueEmbed(player) {
  const currentTrack = player.currentTrack;
  const tracks = [...player.queue];
  const totalDuration = tracks.reduce((acc, t) => acc + (t.length || 0), 0);
  const sourceIcon = currentTrack ? getSourceIcon(currentTrack) : '🎵';
  const repeatLabel = formatRepeatMode(player.loop || 0);
  const thumbnail = currentTrack ? getTrackThumbnail(currentTrack) : null;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Cola de Reproducción')
    .setDescription(
      `**Reproduciendo ahora:**\n` +
      `${sourceIcon} **[${currentTrack.title}](${currentTrack.uri})** - *${currentTrack.author}*\n` +
      `└ Solicitado por ${currentTrack.requester}`,
    )
    .addFields(
      { name: '🔁 Repetición', value: repeatLabel, inline: true },
      { name: '🔊 Volumen', value: `${player.volume}%`, inline: true },
    );

  const activeFilters = getActiveFilters(player);
  if (activeFilters.length > 0) {
    embed.addFields({
      name: '🎛️ Filtros',
      value: activeFilters.map(f => FILTER_NAMES[f] || f).join(', '),
      inline: false,
    });
  }

  if (thumbnail) embed.setThumbnail(thumbnail);

  if (tracks.length === 0) {
    embed.addFields({ name: 'Próximas canciones', value: 'No hay más canciones en la cola.' });
  } else {
    let queueList = '';
    const maxShow = 10;
    tracks.slice(0, maxShow).forEach((track, index) => {
      queueList += `**${index + 1}.** [${track.title}](${track.uri}) - *${track.author}* (${formatDurationMs(track.length)})\n`;
    });
    if (tracks.length > maxShow) {
      queueList += `\n*y ${tracks.length - maxShow} canciones más...*`;
    }
    embed.addFields(
      { name: `Próximas canciones (${tracks.length})`, value: queueList },
      { name: '⏱️ Duración total en cola', value: formatDurationMs(totalDuration), inline: true },
    );
  }

  embed.setTimestamp();
  return embed;
}

// ========== TRACK SELECTION UI ==========

async function showTrackSelection(interaction, tracks, context = 'play') {
  if (!tracks || tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0];

  const select = new StringSelectMenuBuilder()
    .setCustomId('track_select')
    .setPlaceholder('🎯 Selecciona el resultado correcto')
    .addOptions(
      tracks.map((track, i) => ({
        label: (track.title || 'Desconocido').substring(0, 100),
        description: `${(track.author || track.uploader || 'Desconocido').substring(0, 50)} — ${formatDurationMs(track.length || track.duration * 1000 || 0)}`,
        value: String(i),
      })),
    );

  const row = new ActionRowBuilder().addComponents(select);

  const message = await interaction.editReply({
    content: `🔍 Se encontraron ${tracks.length} resultados. **Selecciona el correcto** (30s):`,
    components: [row],
  });

  try {
    const collected = await message.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 30000,
    });
    const selectedIndex = parseInt(collected.values[0]);
    await collected.update({ components: [] });
    return tracks[selectedIndex];
  } catch {
    await interaction.editReply({
      content: '⏰ Tiempo agotado. Usa el comando de nuevo.',
      components: [],
    });
    return null;
  }
}

// ========== DEEZER API ==========

async function getDeezerTrackInfo(deezerId) {
  const { data } = await axios.get(`https://api.deezer.com/track/${deezerId}`, {
    timeout: 10000,
  });

  if (!data || !data.title) {
    throw new Error('No se pudo obtener información de Deezer');
  }

  return {
    id: data.id,
    title: data.title,
    artist: data.artist?.name || 'Desconocido',
    album: data.album?.title || '',
    thumbnail: data.album?.cover || '',
    duration: data.duration || 0,
    preview: data.preview || '',
  };
}

// ========== SPOTIFY oEmbed ==========

async function getSpotifyTrackInfo(spotifyUrl) {
  const { data } = await axios.get('https://open.spotify.com/oembed', {
    params: { url: spotifyUrl },
    timeout: 10000,
  });
  return {
    title: data.title,
    artist: data.author_name,
    thumbnail: data.thumbnail_url,
  };
}

// ========== YT-DLP HELPERS ==========

async function searchYouTube(query) {
  const result = await json(`ytsearch5:${query}`, {
    ...YTDLP_FLAGS,
    flatPlaylist: false,
  });

  if (!result || !result.entries || result.entries.length === 0) {
    throw new Error('No se encontraron resultados en YouTube');
  }

  const videos = result.entries.filter(
    e => e && e.webpage_url && e.title && e.duration > 0,
  );

  if (videos.length === 0) {
    throw new Error('No se encontraron videos en YouTube');
  }

  return videos.slice(0, 5);
}

async function searchSoundCloud(query) {
  const result = await json(`scsearch5:${query}`, {
    ...YTDLP_FLAGS,
    flatPlaylist: false,
  });

  if (!result || !result.entries || result.entries.length === 0) {
    throw new Error('No se encontraron resultados en SoundCloud');
  }

  const tracks = result.entries.filter(
    e => e && e.webpage_url && e.title,
  );

  if (tracks.length === 0) {
    throw new Error('No se encontraron tracks en SoundCloud');
  }

  return tracks.slice(0, 5);
}

async function getMediaInfo(url) {
  return json(url, YTDLP_FLAGS);
}

async function getDownloadURL(mediaUrl, format = 'ba/ba*') {
  const info = await json(mediaUrl, {
    ...YTDLP_FLAGS,
    format,
  });

  if (!info || !info.url) {
    throw new Error('No se pudo obtener la URL de descarga');
  }

  return {
    downloadUrl: info.url,
    title: info.title || info.fulltitle || 'Desconocido',
    duration: info.duration || 0,
    uploader: info.uploader || info.channel || 'Desconocido',
    uploaderUrl: info.uploader_url || info.channel_url || '',
    thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || '',
  };
}

async function estimateFileSize(url) {
  try {
    const https = require('https');
    const http = require('http');
    const protocol = url.startsWith('https') ? https : http;

    return new Promise(resolve => {
      const req = protocol.request(url, { method: 'HEAD', timeout: 8000 }, res => {
        const len = parseInt(res.headers['content-length'] || '0', 10);
        res.destroy();
        resolve(len > 0 ? len / (1024 * 1024) : 0);
      });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.end();
    });
  } catch {
    return 0;
  }
}

// ========== VOICE CHANNEL VALIDATORS ==========

function validateVoiceChannel(interaction) {
  const voiceChannel = interaction.member.voice.channel;
  if (!voiceChannel) {
    return { valid: false, error: '❌ Debes estar en un canal de voz para usar este comando.' };
  }
  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return { valid: false, error: '❌ No tengo permisos para conectar o hablar en ese canal de voz.' };
  }
  return { valid: true, channel: voiceChannel };
}

function validateQueue(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue) {
    return { valid: false, error: '❌ No hay nada reproduciéndose.', queue: null };
  }
  return { valid: true, queue };
}

// ========== DOWNLOAD VALIDATOR ==========

function validateDownloadSource(query, formato, fuente, fuenteExplicit) {
  const spotifyTrackId = extractSpotifyID(query);
  const deezerTrackId = extractDeezerID(query);
  const isSoundCloud = isSoundCloudUrl(query);
  const isYouTubeUrl = extractYouTubeID(query);

  if (formato === 'video' && (spotifyTrackId || deezerTrackId || isSoundCloud || (!isYouTubeUrl && fuente === 'soundcloud'))) {
    return { valid: false, error: '❌ El formato **video** solo está disponible para YouTube.' };
  }

  if (fuenteExplicit && fuente === 'soundcloud' && isYouTubeUrl) {
    return { valid: false, error: '❌ La URL es de YouTube, pero seleccionaste SoundCloud como fuente. Usa el comando sin especificar fuente para auto-detección.' };
  }
  if (fuenteExplicit && fuente === 'youtube' && isSoundCloud) {
    return { valid: false, error: '❌ La URL es de SoundCloud, pero seleccionaste YouTube como fuente. Usa el comando sin especificar fuente para auto-detección.' };
  }

  return { valid: true, spotifyTrackId, deezerTrackId, isSoundCloud, isYouTubeUrl };
}

// ========== EXPORTS ==========

module.exports = {
  // Constants
  FILTER_NAMES,
  YTDLP_FLAGS,

  // Format helpers
  formatDuration,
  formatDurationMs,
  formatRepeatMode,

  // URL detectors
  extractYouTubeID,
  extractSpotifyID,
  extractDeezerID,
  isSoundCloudUrl,

  // Source helpers
  getSourceIcon,
  getActiveFilters,
  getTrackThumbnail,

  // Progress bar
  createProgressBar,

  // Embed builders
  createNowPlayingEmbed,
  createQueueEmbed,

  // UI
  showTrackSelection,

  // API
  getDeezerTrackInfo,
  getSpotifyTrackInfo,

  // yt-dlp
  searchYouTube,
  searchSoundCloud,
  getMediaInfo,
  getDownloadURL,
  estimateFileSize,

  // Validators
  validateVoiceChannel,
  validateQueue,
  validateDownloadSource,

  // Kazagumo access for commands
  getKazagumo,
  getPlayer,
  getQueue,

  // Logger
  logger,
};

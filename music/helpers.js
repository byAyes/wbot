const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { json } = require('@distube/yt-dlp');
const { useMainPlayer, QueryType, QueueRepeatMode } = require('discord-player');
const axios = require('axios');
const { getQueue } = require('./player');
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
    case 3: return '♾️ Autoplay';
    default: return '❌ Desactivado';
  }
}

// ========== URL DETECTORS ==========

function extractYouTubeID(text) {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
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
  const source = track.source || track.queryType || '';
  if (source.includes('spotify')) return '🎵';
  if (source.includes('soundcloud')) return '☁️';
  if (source.includes('apple')) return '🍎';
  if (source.includes('deezer')) return '📻';
  if (source.includes('youtube')) return '▶️';
  return '🎵';
}

function getActiveFilters(queue) {
  if (!queue.filters?.ffmpeg) return [];
  return Object.keys(FILTER_NAMES).filter(f => queue.filters.ffmpeg.isEnabled(f));
}

// ========== EMBED BUILDERS ==========

function createNowPlayingEmbed(queue, track) {
  const progress = queue.node.createProgressBar({ timecodes: true });
  const activeFilters = getActiveFilters(queue);
  const sourceIcon = getSourceIcon(track);
  const sourceLabel = track.source || 'desconocida';

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${sourceIcon} Reproduciendo ahora`)
    .setDescription(`**[${track.title}](${track.url})**\nPor **${track.author}**`)
    .addFields(
      { name: '⏳ Duración', value: formatDurationMs(track.durationMS), inline: true },
      { name: '👤 Solicitado por', value: `${track.requestedBy}`, inline: true },
      { name: '📋 En cola', value: `${queue.tracks.size} canciones`, inline: true },
    )
    .setThumbnail(track.thumbnail);

  if (progress) {
    embed.addFields({ name: '▶️ Progreso', value: progress, inline: false });
  }

  const repeatLabel = formatRepeatMode(queue.repeatMode);
  embed.addFields({ name: '🔁 Modo repetición', value: repeatLabel, inline: true });

  const vol = queue.node.volume;
  embed.addFields({ name: '🔊 Volumen', value: `${vol}%`, inline: true });

  if (activeFilters.length > 0) {
    embed.addFields({
      name: '🎛️ Filtros activos',
      value: activeFilters.map(f => FILTER_NAMES[f] || f).join(', '),
      inline: false,
    });
  }

  embed.setFooter({ text: `Fuente: ${sourceLabel}` });
  embed.setTimestamp();
  return embed;
}

function createQueueEmbed(queue) {
  const currentTrack = queue.currentTrack;
  const tracks = queue.tracks.toArray();
  const totalDuration = tracks.reduce((acc, t) => acc + (t.durationMS || 0), 0);
  const sourceIcon = currentTrack ? getSourceIcon(currentTrack) : '🎵';
  const repeatLabel = formatRepeatMode(queue.repeatMode);
  const isShuffling = queue.isShuffling ? '✅ Activado' : '❌ Desactivado';
  const activeFilters = getActiveFilters(queue);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Cola de Reproducción')
    .setDescription(
      `**Reproduciendo ahora:**\n` +
      `${sourceIcon} **[${currentTrack.title}](${currentTrack.url})** - *${currentTrack.author}*\n` +
      `└ Solicitado por ${currentTrack.requestedBy}`
    )
    .addFields(
      { name: '🔁 Repetición', value: repeatLabel, inline: true },
      { name: '🔀 Shuffle', value: isShuffling, inline: true },
      { name: '🔊 Volumen', value: `${queue.node.volume}%`, inline: true },
    );

  if (activeFilters.length > 0) {
    embed.addFields({
      name: '🎛️ Filtros',
      value: activeFilters.map(f => FILTER_NAMES[f] || f).join(', '),
      inline: false,
    });
  }

  if (tracks.length === 0) {
    embed.addFields({ name: 'Próximas canciones', value: 'No hay más canciones en la cola.' });
  } else {
    let queueList = '';
    const maxShow = 10;
    tracks.slice(0, maxShow).forEach((track, index) => {
      queueList += `**${index + 1}.** [${track.title}](${track.url}) - *${track.author}* (${formatDurationMs(track.durationMS)})\n`;
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
        description: `${(track.author || track.uploader || track.channel || 'Desconocido').substring(0, 50)} — ${formatDurationMs(track.durationMS || track.duration * 1000 || 0)}`,
        value: String(i),
      }))
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
      content: `⏰ Tiempo agotado. Usa el comando de nuevo.`,
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
    e => e && e.webpage_url && e.title && e.duration > 0
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
    e => e && e.webpage_url && e.title
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
  if (!queue || !queue.isPlaying()) {
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

// ========== COMMON NODE OPTIONS ==========

function getPlayNodeOptions(metadata) {
  return {
    nodeOptions: {
      metadata,
      leaveOnEmpty: true,
      leaveOnEmptyCooldown: 300000,
      leaveOnEnd: true,
      leaveOnEndCooldown: 300000,
      selfDeaf: true,
      skipOnNoStream: true,
    },
  };
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

  // Options
  getPlayNodeOptions,

  // Re-exports for convenience
  useMainPlayer,
  QueryType,
  QueueRepeatMode,
  logger,
};

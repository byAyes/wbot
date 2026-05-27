const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { json } = require('@distube/yt-dlp');
const { useMainPlayer, QueryType, QueueRepeatMode } = require('discord-player');
const axios = require('axios');
const { getQueue } = require('../music/player');
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
  // Matches deezer.com/track/ID or deezer.page.link/*
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
      content: `⏰ Tiempo agotado. Usa \`/play ${context}\` de nuevo.`,
      components: [],
    });
    return null;
  }
}

// ========== DEEZER API ==========

/**
 * Detects Deezer URLs and fetches track info from the public Deezer API
 */
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

// ========== COMMAND DEFINITION ==========

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Reproduce música, descarga audio/video y administra la cola')

    // --- Subcomando: play (reproducir en voz) ---
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Reproduce música en tu canal de voz (YouTube, Spotify, SoundCloud, Deezer)')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Nombre de la canción o URL (YouTube/Spotify/SoundCloud/Deezer)')
            .setRequired(true)))

    // --- Subcomando: download (descargar archivo) ---
    .addSubcommand(sub =>
      sub.setName('download')
        .setDescription('Descarga audio/video de YouTube, SoundCloud, Spotify o Deezer')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Nombre de la canción/video o URL')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('formato')
            .setDescription('Formato de descarga (por defecto: audio)')
            .setRequired(false)
            .addChoices(
              { name: 'Audio (MP3)', value: 'audio' },
              { name: 'Video (MP4)', value: 'video' },
            ))
        .addStringOption(option =>
          option.setName('fuente')
            .setDescription('Fuente de búsqueda (se auto-detecta si es una URL)')
            .setRequired(false)
            .addChoices(
              { name: 'YouTube', value: 'youtube' },
              { name: 'SoundCloud', value: 'soundcloud' },
            )))

    // --- Subcomando: skip ---
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('⏭️ Salta a la siguiente canción'))

    // --- Subcomando: stop ---
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('🛑 Detiene la música, limpia la cola y sale del canal'))

    // --- Subcomando: pause ---
    .addSubcommand(sub =>
      sub.setName('pause')
        .setDescription('⏸️ Pausa la reproducción actual'))

    // --- Subcomando: resume ---
    .addSubcommand(sub =>
      sub.setName('resume')
        .setDescription('▶️ Reanuda la reproducción pausada'))

    // --- Subcomando: nowplaying ---
    .addSubcommand(sub =>
      sub.setName('nowplaying')
        .setDescription('📌 Muestra la canción que se está reproduciendo'))

    // --- Subcomando: queue ---
    .addSubcommand(sub =>
      sub.setName('queue')
        .setDescription('📋 Muestra la cola de reproducción actual'))

    // --- Subcomando: volume ---
    .addSubcommand(sub =>
      sub.setName('volume')
        .setDescription('🔊 Ajusta el volumen (1-100)')
        .addIntegerOption(option =>
          option.setName('nivel')
            .setDescription('Nivel de volumen (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)))

    // --- Subcomando: shuffle ---
    .addSubcommand(sub =>
      sub.setName('shuffle')
        .setDescription('🔀 Activa/desactiva el modo aleatorio'))

    // --- Subcomando: loop ---
    .addSubcommand(sub =>
      sub.setName('loop')
        .setDescription('🔁 Cambia el modo de repetición')
        .addStringOption(option =>
          option.setName('modo')
            .setDescription('Modo de repetición')
            .setRequired(true)
            .addChoices(
              { name: '❌ Desactivado', value: 'off' },
              { name: '🔂 Repetir canción', value: 'track' },
              { name: '🔁 Repetir cola', value: 'queue' },
              { name: '♾️ Autoplay', value: 'autoplay' },
            )))

    // --- Subcomando: remove ---
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('🗑️ Elimina una canción de la cola por su número')
        .addIntegerOption(option =>
          option.setName('numero')
            .setDescription('Número de la canción en la cola')
            .setRequired(true)
            .setMinValue(1)))

    // --- Subcomando: move ---
    .addSubcommand(sub =>
      sub.setName('move')
        .setDescription('📦 Mueve una canción a otra posición en la cola')
        .addIntegerOption(option =>
          option.setName('desde')
            .setDescription('Número actual de la canción')
            .setRequired(true)
            .setMinValue(1))
        .addIntegerOption(option =>
          option.setName('hasta')
            .setDescription('Nueva posición')
            .setRequired(true)
            .setMinValue(1)))

    // --- Subcomando: seek ---
    .addSubcommand(sub =>
      sub.setName('seek')
        .setDescription('⏩ Adelanta/retrocede a un punto específico de la canción')
        .addIntegerOption(option =>
          option.setName('segundos')
            .setDescription('Posición en segundos')
            .setRequired(true)
            .setMinValue(0)))

    // --- Subcomando: lyrics ---
    .addSubcommand(sub =>
      sub.setName('lyrics')
        .setDescription('📝 Muestra la letra de la canción actual'))

    // --- Subcomando: filters ---
    .addSubcommand(sub =>
      sub.setName('filters')
        .setDescription('🎛️ Activa o desactiva filtros de audio')
        .addStringOption(option =>
          option.setName('filtro')
            .setDescription('Filtro a aplicar')
            .setRequired(true)
            .addChoices(
              { name: '🎵 Bass Boost (Bajo)', value: 'bassboost_low' },
              { name: '🎵 Bass Boost', value: 'bassboost' },
              { name: '🎵 Bass Boost (Alto)', value: 'bassboost_high' },
              { name: '🌀 8D', value: '8D' },
              { name: '🌊 Vaporwave', value: 'vaporwave' },
              { name: '⚡ Nightcore', value: 'nightcore' },
              { name: '🌐 Phaser', value: 'phaser' },
              { name: '📳 Tremolo', value: 'tremolo' },
              { name: '🎸 Vibrato', value: 'vibrato' },
              { name: '🔙 Reverse', value: 'reverse' },
              { name: '🔊 Treble', value: 'treble' },
              { name: '📈 Normalizer', value: 'normalizer' },
              { name: '🔊 Surround', value: 'surrounding' },
              { name: '🔊 Sub Boost', value: 'subboost' },
              { name: '🎤 Karaoke', value: 'karaoke' },
              { name: '🌀 Flanger', value: 'flanger' },
              { name: '📉 Compresor', value: 'compressor' },
              { name: '☕ Lo-Fi', value: 'lofi' },
              { name: '💥 Earrape', value: 'earrape' },
              { name: '🎛️ Mono', value: 'mono' },
            )))

    // --- Subcomando: clear ---
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('🗑️ Limpia toda la cola de reproducción')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'play': return handlePlay(interaction);
      case 'download': return handleDownload(interaction);
      case 'skip': return handleSkip(interaction);
      case 'stop': return handleStop(interaction);
      case 'pause': return handlePause(interaction);
      case 'resume': return handleResume(interaction);
      case 'nowplaying': return handleNowPlaying(interaction);
      case 'queue': return handleQueue(interaction);
      case 'volume': return handleVolume(interaction);
      case 'shuffle': return handleShuffle(interaction);
      case 'loop': return handleLoop(interaction);
      case 'remove': return handleRemove(interaction);
      case 'move': return handleMove(interaction);
      case 'seek': return handleSeek(interaction);
      case 'lyrics': return handleLyrics(interaction);
      case 'filters': return handleFilters(interaction);
      case 'clear': return handleClear(interaction);
      default:
        return interaction.reply({ content: '❌ Subcomando no válido.', ephemeral: true });
    }
  },
};

// =====================================================================
//  HANDLERS: REPRODUCIR EN VOZ
// =====================================================================

async function handlePlay(interaction) {
  const voiceCheck = validateVoiceChannel(interaction);
  if (!voiceCheck.valid) {
    return interaction.reply({ content: voiceCheck.error, ephemeral: true });
  }
  const { channel: voiceChannel } = voiceCheck;
  const query = interaction.options.getString('query');
  const deezerId = extractDeezerID(query);

  await interaction.deferReply();

  try {
    const player = useMainPlayer();

    // --- Deezer URL: fetch track info, then search on YouTube ---
    if (deezerId) {
      await interaction.editReply({ content: '📻 Obteniendo información de Deezer...' });
      const trackInfo = await getDeezerTrackInfo(deezerId);

      await interaction.editReply({
        content: `🔍 Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
      });

      const searchResult = await player.search(`${trackInfo.artist} - ${trackInfo.title}`, {
        requestedBy: interaction.user,
        searchEngine: QueryType.AUTO,
      });

      if (!searchResult || !searchResult.tracks.length) {
        return interaction.editReply({ content: '❌ No se encontró esta canción en YouTube.' });
      }

      let track = searchResult.tracks[0];

      if (searchResult.tracks.length > 1) {
        const selected = await showTrackSelection(interaction, searchResult.tracks, 'play');
        if (!selected) return;
        track = selected;
      }

      await interaction.editReply({
        content: `📻 **${trackInfo.title}** - *${trackInfo.artist}* (Deezer → YouTube)`,
        components: [],
      });

      const { queue } = await player.play(voiceChannel, track, {
        nodeOptions: {
          metadata: interaction,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 300000,
          selfDeaf: true,
          skipOnNoStream: true,
        },
      });

      if (queue.currentTrack) {
        const embed = createNowPlayingEmbed(queue, queue.currentTrack);
        await interaction.editReply({ content: null, embeds: [embed] });
      }
      return;
    }

    // --- Normal search with discord-player (handles YT/Spotify/SC URLs automatically) ---
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
      searchEngine: QueryType.AUTO,
    });

    if (!searchResult || !searchResult.tracks.length) {
      return interaction.editReply({ content: '❌ No se encontraron resultados para tu búsqueda.' });
    }

    // If it's a playlist
    if (searchResult.hasPlaylist()) {
      const playlist = searchResult.playlist;
      const { queue } = await player.play(voiceChannel, searchResult, {
        nodeOptions: {
          metadata: interaction,
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 300000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 300000,
          selfDeaf: true,
          skipOnNoStream: true,
        },
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📑 Lista añadida a la cola')
        .setDescription(`**[${playlist.title}](${playlist.url})**`)
        .addFields(
          { name: '👤 Autor', value: playlist.author?.name || 'Desconocido', inline: true },
          { name: '🎵 Canciones', value: `${playlist.tracks.length}`, inline: true },
          { name: '⏱️ Duración', value: playlist.durationFormatted || formatDurationMs(playlist.estimatedDuration), inline: true },
        )
        .setThumbnail(playlist.thumbnail)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // --- Track selection UI if multiple results ---
    let track = searchResult.tracks[0];

    if (searchResult.tracks.length > 1) {
      const selected = await showTrackSelection(interaction, searchResult.tracks, 'play');
      if (!selected) return;
      track = selected;
    }

    await interaction.editReply({
      content: `${getSourceIcon(track)} **${track.title}** - *${track.author}*`,
      components: [],
    });

    const { queue } = await player.play(voiceChannel, track, {
      nodeOptions: {
        metadata: interaction,
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: 300000,
        leaveOnEnd: true,
        leaveOnEndCooldown: 300000,
        selfDeaf: true,
        skipOnNoStream: true,
      },
    });

    if (queue.currentTrack) {
      const embed = createNowPlayingEmbed(queue, queue.currentTrack);
      await interaction.editReply({ content: null, embeds: [embed] });
    }

  } catch (error) {
    logger.error('Error en play play:', error);
    let errorMsg = `❌ Error al reproducir: ${error.message}`;
    if (error.message?.toLowerCase().includes('ffmpeg') || error.message?.toLowerCase().includes('encoder')) {
      errorMsg = '❌ FFmpeg no está instalado. Asegúrate de que ffmpeg esté disponible en el sistema.';
    }
    try { await interaction.editReply({ content: errorMsg }); }
    catch { await interaction.followUp({ content: errorMsg, ephemeral: true }); }
  }
}

// =====================================================================
//  HANDLERS: DESCARGAR
// =====================================================================

async function handleDownload(interaction) {
  const query = interaction.options.getString('query');
  const formato = interaction.options.getString('formato') || 'audio';
  const fuenteRaw = interaction.options.getString('fuente');
  const fuenteExplicit = fuenteRaw !== null;
  const fuente = fuenteRaw || 'youtube';

  // --- Pre-validate ---
  const spotifyTrackId = extractSpotifyID(query);
  const deezerTrackId = extractDeezerID(query);
  const isSoundCloud = isSoundCloudUrl(query);
  const isYouTubeUrl = extractYouTubeID(query);

  if (formato === 'video' && (spotifyTrackId || deezerTrackId || isSoundCloud || (!isYouTubeUrl && fuente === 'soundcloud'))) {
    return interaction.reply({
      content: '❌ El formato **video** solo está disponible para YouTube.',
      ephemeral: true,
    });
  }

  if (fuenteExplicit && fuente === 'soundcloud' && isYouTubeUrl) {
    return interaction.reply({
      content: '❌ La URL es de YouTube, pero seleccionaste SoundCloud como fuente. Usa `/play download` sin especificar fuente para auto-detección.',
      ephemeral: true,
    });
  }
  if (fuenteExplicit && fuente === 'youtube' && isSoundCloud) {
    return interaction.reply({
      content: '❌ La URL es de SoundCloud, pero seleccionaste YouTube como fuente. Usa `/play download` sin especificar fuente para auto-detección.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  try {
    let mediaUrl, mediaTitle, uploader, duration, thumbnail, fuenteActual;

    // --- Deezer URL ---
    if (deezerTrackId) {
      fuenteActual = 'deezer';
      await interaction.editReply({ content: '📻 Obteniendo información de Deezer...' });

      const trackInfo = await getDeezerTrackInfo(deezerTrackId);

      await interaction.editReply({
        content: `🔍 Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
      });

      const videos = await searchYouTube(`${trackInfo.artist} - ${trackInfo.title}`);
      const selected = await showTrackSelection(interaction, videos, 'download');
      if (!selected) return;
      mediaUrl = selected.webpage_url;
      mediaTitle = `${trackInfo.title} — ${trackInfo.artist}`;
      uploader = selected.uploader || selected.channel || 'Desconocido';
      duration = selected.duration || 0;
      thumbnail = trackInfo.thumbnail || selected.thumbnail || '';
    }

    // --- Spotify URL ---
    else if (spotifyTrackId) {
      fuenteActual = 'spotify';
      await interaction.editReply({ content: '🎵 Obteniendo información de Spotify...' });

      const trackInfo = await getSpotifyTrackInfo(`https://open.spotify.com/track/${spotifyTrackId}`);

      await interaction.editReply({
        content: `🔍 Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
      });

      const videos = await searchYouTube(`${trackInfo.artist} - ${trackInfo.title}`);
      const selected = await showTrackSelection(interaction, videos, 'download');
      if (!selected) return;
      mediaUrl = selected.webpage_url;
      mediaTitle = `${trackInfo.title} — ${trackInfo.artist}`;
      uploader = selected.uploader || selected.channel || 'Desconocido';
      duration = selected.duration || 0;
      thumbnail = trackInfo.thumbnail || selected.thumbnail || '';
    }

    // --- SoundCloud ---
    else if (isSoundCloud || fuente === 'soundcloud') {
      fuenteActual = 'soundcloud';

      if (isSoundCloud) {
        await interaction.editReply({ content: '☁️ Obteniendo información de SoundCloud...' });
        const info = await getMediaInfo(query);
        mediaUrl = query;
        mediaTitle = info.title || 'Desconocido';
        uploader = info.uploader || info.channel || 'Desconocido';
        duration = info.duration || 0;
        thumbnail = info.thumbnail || '';
      } else {
        await interaction.editReply({ content: `☁️ Buscando "${query}" en SoundCloud...` });
        const tracks = await searchSoundCloud(query);
        const selected = await showTrackSelection(interaction, tracks, 'download');
        if (!selected) return;
        mediaUrl = selected.webpage_url;
        mediaTitle = selected.title;
        uploader = selected.uploader || selected.channel || 'Desconocido';
        duration = selected.duration || 0;
        thumbnail = selected.thumbnail || '';
      }
    }

    // --- YouTube (default) ---
    else {
      fuenteActual = 'youtube';

      if (isYouTubeUrl) {
        mediaUrl = query.startsWith('http') ? query : `https://youtube.com/watch?v=${isYouTubeUrl}`;
        await interaction.editReply({ content: '⏳ Obteniendo información del video...' });
        const info = await getMediaInfo(mediaUrl);
        mediaTitle = info.title || 'Desconocido';
        uploader = info.uploader || info.channel || 'Desconocido';
        duration = info.duration || 0;
        thumbnail = info.thumbnail || '';
      } else {
        await interaction.editReply({ content: `🔍 Buscando "${query}" en YouTube...` });
        const videos = await searchYouTube(query);
        const selected = await showTrackSelection(interaction, videos, 'download');
        if (!selected) return;
        mediaUrl = selected.webpage_url;
        mediaTitle = selected.title;
        uploader = selected.uploader || selected.channel || 'Desconocido';
        duration = selected.duration || 0;
        thumbnail = selected.thumbnail || '';
      }
    }

    // --- Show embed ---
    const colorMap = { soundcloud: 0xFF7700, spotify: 0x1DB954, deezer: 0xFEAA2D, youtube: 0xFF0000 };
    const emojiMap = { soundcloud: '☁️', spotify: '🎵', deezer: '📻', youtube: '▶️' };
    const nameMap = { soundcloud: 'SoundCloud', spotify: 'Spotify', deezer: 'Deezer', youtube: 'YouTube' };

    const embed = new EmbedBuilder()
      .setColor(colorMap[fuenteActual] || 0xFF0000)
      .setTitle(mediaTitle.length > 80 ? mediaTitle.substring(0, 77) + '...' : mediaTitle)
      .setURL(mediaUrl)
      .setThumbnail(thumbnail)
      .addFields(
        { name: '👤 Autor', value: uploader, inline: true },
        { name: '⏳ Duración', value: formatDuration(duration), inline: true },
        { name: '📥 Formato', value: formato === 'audio' ? '🎵 Audio' : '🎬 Video', inline: true },
        { name: '🌐 Fuente', value: `${emojiMap[fuenteActual] || '▶️'} ${nameMap[fuenteActual] || 'YouTube'}`, inline: true },
      )
      .setFooter({ text: '⬇️ Obteniendo enlace de descarga...' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // --- Get download URL ---
    const formatSelector = formato === 'audio' ? 'ba/ba*' : 'best[height<=720]';
    const fileExt = formato === 'audio' ? 'mp3' : 'mp4';
    const downloadInfo = await getDownloadURL(mediaUrl, formatSelector);
    const downloadUrl = downloadInfo.downloadUrl;

    // --- Check file size for video ---
    if (formato === 'video') {
      const sizeMB = await estimateFileSize(downloadUrl);
      const maxSize = 25;

      if (sizeMB > maxSize) {
        logger.warn(`Video too large (${sizeMB.toFixed(1)}MB), falling back to audio`);
        const audioInfo = await getDownloadURL(mediaUrl, 'ba/ba*');

        await interaction.editReply({
          content: `⚠️ El video es muy grande (${sizeMB.toFixed(1)}MB, límite ${maxSize}MB).\n⬇️ Enviando solo el audio en su lugar:`,
          embeds: [],
        });
        await interaction.followUp({
          content: `🎵 **${downloadInfo.title}** — Audio:`,
          files: [{ attachment: audioInfo.downloadUrl, name: `${downloadInfo.title}.mp3` }],
        });
        return;
      }
    }

    // --- Send file ---
    await interaction.editReply({
      content: `✅ **${downloadInfo.title}** — Enviando ${formato === 'audio' ? 'audio' : 'video'}...`,
      embeds: [],
    });

    await interaction.followUp({
      content: formato === 'audio' ? '🎵 Aquí tienes el audio:' : '🎬 Aquí tienes el video:',
      files: [{ attachment: downloadUrl, name: `${downloadInfo.title}.${fileExt}` }],
    });

  } catch (error) {
    logger.error('Error en play download:', error);

    let userMessage = `❌ Error al procesar la solicitud: ${error.message}`;

    if (error.code === 'ENOENT' || error.message?.includes('spawn') || error.message?.includes('ENOENT')) {
      userMessage = '❌ yt-dlp no está instalado. Ejecuta `npm install` para descargarlo.';
    } else if (error.message?.includes('HTTP Error 429') || error.message?.includes('Too Many Requests')) {
      userMessage = '❌ El servicio está limitando solicitudes temporalmente. Intenta de nuevo en unos minutos.';
    } else if (error.message?.includes('HTTP Error 403')) {
      userMessage = '❌ El servicio bloqueó la solicitud. Intenta de nuevo más tarde.';
    }

    await interaction.editReply({ content: userMessage });
  }
}

// =====================================================================
//  HANDLERS: CONTROL DE REPRODUCCIÓN
// =====================================================================

async function handleSkip(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const currentTrack = queue.currentTrack;
  queue.node.skip();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`⏭️ Saltaste **${currentTrack.title}**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleStop(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  queue.delete();

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setDescription('🛑 Reproducción detenida. ¡Nos vemos!')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handlePause(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  if (queue.node.isPaused()) {
    return interaction.reply({ content: '⚠️ Ya está pausada. Usa `/play resume`.', ephemeral: true });
  }

  queue.node.pause();

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setDescription('⏸️ Pausada. Usa `/play resume` para continuar.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleResume(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  if (!queue.node.isPaused()) {
    return interaction.reply({ content: '⚠️ No está pausada.', ephemeral: true });
  }

  queue.node.resume();

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setDescription('▶️ Reanudada.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// =====================================================================
//  HANDLERS: INFORMACIÓN
// =====================================================================

async function handleNowPlaying(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const embed = createNowPlayingEmbed(queue, queue.currentTrack);
  await interaction.reply({ embeds: [embed] });
}

async function handleQueue(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const embed = createQueueEmbed(queue);
  await interaction.reply({ embeds: [embed] });
}

// =====================================================================
//  HANDLERS: AJUSTES
// =====================================================================

async function handleVolume(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const volume = interaction.options.getInteger('nivel');
  queue.node.setVolume(volume);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`🔊 Volumen ajustado a **${volume}%**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleShuffle(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const isNowShuffling = queue.toggleShuffle();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(isNowShuffling
      ? '🔀 **Shuffle activado** — Las canciones se reproducirán en orden aleatorio.'
      : '🔀 **Shuffle desactivado** — Las canciones se reproducirán en orden normal.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleLoop(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const mode = interaction.options.getString('modo');
  const modeMap = {
    off: QueueRepeatMode.OFF,
    track: QueueRepeatMode.TRACK,
    queue: QueueRepeatMode.QUEUE,
    autoplay: QueueRepeatMode.AUTOPLAY,
  };
  const labelMap = {
    off: '❌ Repetición desactivada',
    track: '🔂 Repitiendo la canción actual',
    queue: '🔁 Repitiendo toda la cola',
    autoplay: '♾️ Autoplay activado — Se añadirán canciones similares automáticamente',
  };

  queue.setRepeatMode(modeMap[mode]);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(labelMap[mode])
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// =====================================================================
//  HANDLERS: COLAS
// =====================================================================

async function handleRemove(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const trackNumber = interaction.options.getInteger('numero');
  const tracks = queue.tracks.toArray();

  if (trackNumber > tracks.length) {
    return interaction.reply({
      content: `❌ El número **${trackNumber}** no es válido. La cola solo tiene **${tracks.length}** canciones.`,
      ephemeral: true,
    });
  }

  const trackToRemove = tracks[trackNumber - 1];
  queue.node.remove(trackToRemove);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`🗑️ Eliminada: **${trackToRemove.title}** - *${trackToRemove.author}*`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleMove(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const from = interaction.options.getInteger('desde');
  const to = interaction.options.getInteger('hasta');
  const tracks = queue.tracks.toArray();

  if (from > tracks.length) {
    return interaction.reply({
      content: `❌ La posición **${from}** no es válida. La cola solo tiene **${tracks.length}** canciones.`,
      ephemeral: true,
    });
  }

  if (to > tracks.length + 1) {
    return interaction.reply({
      content: `❌ La posición **${to}** está fuera del rango (máximo ${tracks.length + 1}).`,
      ephemeral: true,
    });
  }

  const trackToMove = tracks[from - 1];
  queue.moveTrack(from - 1, to - 1);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`📦 Movido **${trackToMove.title}** de **#${from}** → **#${to}**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleSeek(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const targetSeconds = interaction.options.getInteger('segundos');
  const targetMs = targetSeconds * 1000;
  const trackDuration = queue.currentTrack?.durationMS || 0;

  if (targetMs > trackDuration) {
    return interaction.reply({
      content: `❌ El tiempo máximo es ${formatDurationMs(trackDuration)} (${Math.floor(trackDuration / 1000)}s).`,
      ephemeral: true,
    });
  }

  await queue.node.seek(targetMs);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`⏩ Adelantado a **${formatDurationMs(targetMs)}** de **${formatDurationMs(trackDuration)}**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// =====================================================================
//  HANDLERS: LYRICS
// =====================================================================

async function handleLyrics(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const track = queue.currentTrack;
  if (!track) {
    return interaction.reply({ content: '❌ No hay canción reproduciéndose.', ephemeral: true });
  }

  await interaction.deferReply();

  try {
    const player = useMainPlayer();
    const searchResult = await player.lyrics.search({
      q: `${track.title} ${track.author}`,
      trackName: track.title,
      artistName: track.author,
    });

    if (!searchResult || searchResult.length === 0) {
      return interaction.editReply({
        content: `📝 No se encontró la letra para **${track.title}** de **${track.author}**.`,
      });
    }

    const lyrics = searchResult[0];
    const plainLyrics = lyrics.plainLyrics || lyrics.lyrics || 'Letra no disponible';

    if (plainLyrics.length > 4000) {
      const attachment = new AttachmentBuilder(Buffer.from(plainLyrics, 'utf-8'), { name: 'lyrics.txt' });
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📝 ${track.title} - ${track.author}`)
        .setDescription('La letra es muy extensa. Se ha adjuntado como archivo de texto.')
        .setThumbnail(track.thumbnail)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed], files: [attachment] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📝 ${track.title} - ${track.author}`)
      .setDescription(plainLyrics.substring(0, 4000))
      .setThumbnail(track.thumbnail)
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    logger.error('Error buscando letras:', error);
    await interaction.editReply({
      content: `❌ Error al buscar la letra para **${track.title}**: ${error.message}`,
    });
  }
}

// =====================================================================
//  HANDLERS: FILTROS
// =====================================================================

async function handleFilters(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const filterName = interaction.options.getString('filtro');
  const isEnabled = queue.filters.ffmpeg.isEnabled(filterName);

  try {
    await queue.filters.ffmpeg.toggle(filterName);

    const embed = new EmbedBuilder()
      .setColor(isEnabled ? 0xED4245 : 0x57F287)
      .setDescription(isEnabled
        ? `❌ Filtro desactivado: ${FILTER_NAMES[filterName] || filterName}`
        : `✅ Filtro activado: ${FILTER_NAMES[filterName] || filterName}`)
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error aplicando filtro:', error);
    return interaction.reply({
      content: `❌ Error al aplicar el filtro: ${error.message}`,
      ephemeral: true,
    });
  }
}

// =====================================================================
//  HANDLERS: CLEAR
// =====================================================================

async function handleClear(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const trackCount = queue.tracks.size;
  queue.clear();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`🗑️ Cola limpiada. Se eliminaron **${trackCount}** canciones.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  // Constants
  FILTER_NAMES,

  // Format helpers
  formatDuration,
  formatDurationMs,

  // URL detectors
  extractDeezerID,
  extractSpotifyID,
  isSoundCloudUrl,
  extractYouTubeID,

  // Source helpers
  getSourceIcon,

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
  validateQueue,
  validateDownloadSource,

  // System
  useMainPlayer,
  QueryType,
  QueueRepeatMode,
  logger,
} = require('../music/helpers');

// ========== COMMAND DEFINITION ==========

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 Controla la reproducción, descarga música y administra la cola')

    // --- Subcomando: download ---
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
            .setDescription('Fuente (se auto-detecta si es URL)')
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
//  HANDLERS: DESCARGAR (SoundCloud es el último recurso)
// =====================================================================

async function handleDownload(interaction) {
  const query = interaction.options.getString('query');
  const formato = interaction.options.getString('formato') || 'audio';
  const fuenteRaw = interaction.options.getString('fuente');
  const fuenteExplicit = fuenteRaw !== null;
  const fuente = fuenteRaw || 'youtube';

  // --- Pre-validate ---
  const sourceCheck = validateDownloadSource(query, formato, fuente, fuenteExplicit);
  if (!sourceCheck.valid) {
    return interaction.reply({ content: sourceCheck.error, ephemeral: true });
  }
  const { deezerTrackId, spotifyTrackId, isSoundCloud, isYouTubeUrl } = sourceCheck;

  await interaction.deferReply();

  try {
    let mediaUrl, mediaTitle, uploader, duration, thumbnail, fuenteActual;

    // --- 1. Deezer URL (máxima prioridad para música) ---
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

    // --- 2. Spotify URL (segunda prioridad para música) ---
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

    // --- 3. YouTube (prioridad sobre SoundCloud para texto/búsquedas) ---
    else if (isYouTubeUrl || (!isSoundCloud && fuente === 'youtube')) {
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

    // --- 4. SoundCloud (último recurso — solo cuando es explícito o URL directa) ---
    else {
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
    logger.error('Error en music download:', error);

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
    return interaction.reply({ content: '⚠️ Ya está pausada. Usa `/music resume`.', ephemeral: true });
  }

  queue.node.pause();

  const embed = new EmbedBuilder()
    .setColor(0xFEE75C)
    .setDescription('⏸️ Pausada. Usa `/music resume` para continuar.')
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
    const { AttachmentBuilder } = require('discord.js');
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

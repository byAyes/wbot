const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { useMainPlayer, QueryType, QueueRepeatMode } = require('discord-player');
const { getQueue } = require('../music/player');
const logger = require('../utils/logger');

// ========== HELPERS ==========

function formatDuration(ms) {
  if (!ms || isNaN(ms)) return 'Desconocida';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function getActiveFilters(queue) {
  if (!queue.filters?.ffmpeg) return [];
  return Object.keys(FILTER_NAMES).filter(f => queue.filters.ffmpeg.isEnabled(f));
}

function getSourceIcon(track) {
  if (!track) return '🎵';
  const source = track.source || track.queryType || '';
  if (source.includes('spotify')) return '🎵';
  if (source.includes('soundcloud')) return '☁️';
  if (source.includes('apple')) return '🍎';
  if (source.includes('youtube')) return '▶️';
  return '🎵';
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
      { name: '⏳ Duración', value: formatDuration(track.durationMS), inline: true },
      { name: '👤 Solicitado por', value: `${track.requestedBy}`, inline: true },
      { name: '📋 En cola', value: `${queue.tracks.size} canciones`, inline: true },
    )
    .setThumbnail(track.thumbnail);

  // Progress bar
  if (progress) {
    embed.addFields({ name: '▶️ Progreso', value: progress, inline: false });
  }

  // Repeat mode
  const repeatLabel = formatRepeatMode(queue.repeatMode);
  embed.addFields({ name: '🔁 Modo repetición', value: repeatLabel, inline: true });

  // Volumen
  const vol = queue.node.volume;
  embed.addFields({ name: '🔊 Volumen', value: `${vol}%`, inline: true });

  // Filtros activos
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
      queueList += `**${index + 1}.** [${track.title}](${track.url}) - *${track.author}* (${formatDuration(track.durationMS)})\n`;
    });
    if (tracks.length > maxShow) {
      queueList += `\n*y ${tracks.length - maxShow} canciones más...*`;
    }
    embed.addFields(
      { name: `Próximas canciones (${tracks.length})`, value: queueList },
      { name: '⏱️ Duración total en cola', value: formatDuration(totalDuration), inline: true },
    );
  }

  embed.setTimestamp();
  return embed;
}

// ========== COMMAND DEFINITION ==========

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 Sistema de música en canales de voz')
    // --- Play ---
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Reproduce música desde YouTube, Spotify o SoundCloud')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Nombre de la canción, artista, URL (YouTube/Spotify/SoundCloud)')
            .setRequired(true)))
    // --- Skip ---
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('⏭️ Salta a la siguiente canción'))
    // --- Stop ---
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('🛑 Detiene la música, limpia la cola y sale del canal'))
    // --- Pause ---
    .addSubcommand(sub =>
      sub.setName('pause')
        .setDescription('⏸️ Pausa la reproducción actual'))
    // --- Resume ---
    .addSubcommand(sub =>
      sub.setName('resume')
        .setDescription('▶️ Reanuda la reproducción pausada'))
    // --- Now Playing ---
    .addSubcommand(sub =>
      sub.setName('nowplaying')
        .setDescription('📌 Muestra la canción que se está reproduciendo'))
    // --- Queue ---
    .addSubcommand(sub =>
      sub.setName('queue')
        .setDescription('📋 Muestra la cola de reproducción actual'))
    // --- Volume ---
    .addSubcommand(sub =>
      sub.setName('volume')
        .setDescription('🔊 Ajusta el volumen (1-100)')
        .addIntegerOption(option =>
          option.setName('nivel')
            .setDescription('Nivel de volumen (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)))
    // --- Shuffle ---
    .addSubcommand(sub =>
      sub.setName('shuffle')
        .setDescription('🔀 Activa/desactiva el modo aleatorio'))
    // --- Loop ---
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
    // --- Remove ---
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('🗑️ Elimina una canción de la cola por su número')
        .addIntegerOption(option =>
          option.setName('numero')
            .setDescription('Número de la canción en la cola')
            .setRequired(true)
            .setMinValue(1)))
    // --- Move ---
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
    // --- Seek ---
    .addSubcommand(sub =>
      sub.setName('seek')
        .setDescription('⏩ Adelanta/retrocede a un punto específico de la canción')
        .addIntegerOption(option =>
          option.setName('segundos')
            .setDescription('Posición en segundos')
            .setRequired(true)
            .setMinValue(0)))
    // --- Lyrics ---
    .addSubcommand(sub =>
      sub.setName('lyrics')
        .setDescription('📝 Muestra la letra de la canción actual'))
    // --- Filters ---
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
              { name: '🎤 Karaoke', value: 'karaoke' },
              { name: '🌀 Flanger', value: 'flanger' },
              { name: '📉 Compresor', value: 'compressor' },
              { name: '☕ Lo-Fi', value: 'lofi' },
              { name: '💥 Earrape', value: 'earrape' },
              { name: '🔊 Surround', value: 'surrounding' },
              { name: '🔊 Sub Boost', value: 'subboost' },
              { name: '🎛️ Mono', value: 'mono' },
            )))
    // --- Clear ---
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('🗑️ Limpia toda la cola de reproducción')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'play': return handlePlay(interaction);
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

// ========== VALIDATION HELPERS ==========

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

// ========== COMMAND HANDLERS ==========

// --- Play ---
async function handlePlay(interaction) {
  const voiceCheck = validateVoiceChannel(interaction);
  if (!voiceCheck.valid) {
    return interaction.reply({ content: voiceCheck.error, ephemeral: true });
  }
  const { channel: voiceChannel } = voiceCheck;
  const query = interaction.options.getString('query');

  await interaction.deferReply();

  try {
    const player = useMainPlayer();

    // Search with auto-detection (handles YouTube, Spotify, SoundCloud URLs automatically)
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
          { name: '⏱️ Duración', value: playlist.durationFormatted || formatDuration(playlist.estimatedDuration), inline: true },
        )
        .setThumbnail(playlist.thumbnail)
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // --- Track selection UI if multiple results ---
    let track = searchResult.tracks[0];

    if (searchResult.tracks.length > 1) {
      const select = new StringSelectMenuBuilder()
        .setCustomId('music_track_select')
        .setPlaceholder('🎯 Selecciona la canción correcta')
        .addOptions(
          searchResult.tracks.slice(0, 5).map((t, i) => ({
            label: (t.title || 'Desconocido').substring(0, 100),
            description: `${(t.author || 'Desconocido').substring(0, 50)} — ${formatDuration(t.durationMS)}`,
            value: String(i),
          }))
        );

      const row = new ActionRowBuilder().addComponents(select);

      const message = await interaction.editReply({
        content: `🔍 Se encontraron ${searchResult.tracks.length} resultados. **Selecciona el correcto** (30s):`,
        components: [row],
      });

      try {
        const collected = await message.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id,
          time: 30000,
        });
        const selectedIndex = parseInt(collected.values[0]);
        track = searchResult.tracks[selectedIndex];
        await collected.update({ components: [] });
      } catch {
        await interaction.editReply({
          content: '⏰ Tiempo agotado. Usa `/music play` de nuevo.',
          components: [],
        });
        return;
      }
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
    logger.error('Error en music play:', error);
    let errorMsg = `❌ Error al reproducir: ${error.message}`;
    if (error.message?.toLowerCase().includes('ffmpeg') || error.message?.toLowerCase().includes('encoder')) {
      errorMsg = '❌ FFmpeg no está instalado. Asegúrate de que ffmpeg esté disponible en el sistema.';
    }
    try { await interaction.editReply({ content: errorMsg }); }
    catch { await interaction.followUp({ content: errorMsg, ephemeral: true }); }
  }
}

// --- Skip ---
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

// --- Stop ---
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

// --- Pause ---
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

// --- Resume ---
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

// --- Now Playing ---
async function handleNowPlaying(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const progress = queue.node.createProgressBar({ timecodes: true });
  const embed = createNowPlayingEmbed(queue, queue.currentTrack);
  await interaction.reply({ embeds: [embed] });
}

// --- Queue ---
async function handleQueue(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const embed = createQueueEmbed(queue);
  await interaction.reply({ embeds: [embed] });
}

// --- Volume ---
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

// --- Shuffle ---
async function handleShuffle(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const isNowShuffling = queue.toggleShuffle();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(isNowShuffling ? '🔀 **Shuffle activado** - Las canciones se reproducirán en orden aleatorio.' : '🔀 **Shuffle desactivado** - Las canciones se reproducirán en orden normal.')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// --- Loop ---
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
    autoplay: '♾️ Autoplay activado - Se añadirán canciones similares automáticamente',
  };

  queue.setRepeatMode(modeMap[mode]);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(labelMap[mode])
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// --- Remove ---
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

// --- Move ---
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
  // moveTrack: move the track at position 'from' (0-indexed in API) to position 'to' (0-indexed in API)
  queue.moveTrack(from - 1, to - 1);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`📦 Movido **${trackToMove.title}** de la posición **#${from}** a **#${to}**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// --- Seek ---
async function handleSeek(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const targetSeconds = interaction.options.getInteger('segundos');
  const targetMs = targetSeconds * 1000;
  const trackDuration = queue.currentTrack?.durationMS || 0;

  if (targetMs > trackDuration) {
    return interaction.reply({
      content: `❌ El tiempo máximo es ${formatDuration(trackDuration)} (${Math.floor(trackDuration / 1000)}s).`,
      ephemeral: true,
    });
  }

  await queue.node.seek(targetMs);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`⏩ Adelantado a **${formatDuration(targetMs)}** de **${formatDuration(trackDuration)}**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// --- Lyrics ---
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
        content: `📝 No se encontró la letra para **${track.title}** de **${track.author}**.\nPuedes buscarla manualmente con: \`/music lyrics\``,
      });
    }

    const lyrics = searchResult[0];
    const plainLyrics = lyrics.plainLyrics || lyrics.lyrics || 'Letra no disponible';

    // If lyrics are too long, split into multiple embeds or send as text file
    if (plainLyrics.length > 4000) {
      // Send as a text attachment
      const { AttachmentBuilder } = require('discord.js');
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

// --- Filters ---
async function handleFilters(interaction) {
  const queueCheck = validateQueue(interaction);
  if (!queueCheck.valid) return interaction.reply({ content: queueCheck.error, ephemeral: true });
  const { queue } = queueCheck;

  const filterName = interaction.options.getString('filtro');
  const isEnabled = queue.filters.ffmpeg.isEnabled(filterName);

  try {
    if (isEnabled) {
      await queue.filters.ffmpeg.toggle(filterName);
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setDescription(`❌ Filtro desactivado: ${FILTER_NAMES[filterName] || filterName}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    } else {
      await queue.filters.ffmpeg.toggle(filterName);
      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setDescription(`✅ Filtro activado: ${FILTER_NAMES[filterName] || filterName}`)
        .setTimestamp();
      return interaction.reply({ embeds: [embed] });
    }
  } catch (error) {
    logger.error('Error aplicando filtro:', error);
    return interaction.reply({
      content: `❌ Error al aplicar el filtro: ${error.message}`,
      ephemeral: true,
    });
  }
}

// --- Clear ---
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

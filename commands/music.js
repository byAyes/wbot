const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useMainPlayer } = require('discord-player');
const { getQueue } = require('../music/player');
const logger = require('../utils/logger');

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

function createNowPlayingEmbed(queue, track) {
  const progress = queue.node.createProgressBar({ timecodes: true });
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎵 Reproduciendo ahora')
    .setDescription(`**[${track.title}](${track.url})**\nPor **${track.author}**`)
    .addFields(
      { name: '⏳ Duración', value: formatDuration(track.durationMS), inline: true },
      { name: '👤 Solicitado por', value: `${track.requestedBy}`, inline: true },
      { name: '📋 En cola', value: `${queue.tracks.size} canciones`, inline: true },
      { name: '▶️ Progreso', value: progress || 'Reproduciendo...', inline: false },
    )
    .setThumbnail(track.thumbnail)
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎵 Sistema de música en canales de voz')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Reproduce música desde YouTube en un canal de voz')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Nombre de la canción, artista o URL de YouTube')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('Salta a la siguiente canción en la cola'))
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('Detiene la música, limpia la cola y sale del canal'))
    .addSubcommand(sub =>
      sub.setName('queue')
        .setDescription('Muestra la cola de reproducción actual'))
    .addSubcommand(sub =>
      sub.setName('nowplaying')
        .setDescription('Muestra la canción que se está reproduciendo'))
    .addSubcommand(sub =>
      sub.setName('pause')
        .setDescription('Pausa la reproducción actual'))
    .addSubcommand(sub =>
      sub.setName('resume')
        .setDescription('Reanuda la reproducción pausada'))
    .addSubcommand(sub =>
      sub.setName('volume')
        .setDescription('Ajusta el volumen de la reproducción (1-100)')
        .addIntegerOption(option =>
          option.setName('nivel')
            .setDescription('Nivel de volumen')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'play':
        return handlePlay(interaction);
      case 'skip':
        return handleSkip(interaction);
      case 'stop':
        return handleStop(interaction);
      case 'queue':
        return handleQueue(interaction);
      case 'nowplaying':
        return handleNowPlaying(interaction);
      case 'pause':
        return handlePause(interaction);
      case 'resume':
        return handleResume(interaction);
      case 'volume':
        return handleVolume(interaction);
      default:
        return interaction.reply({ content: '❌ Subcomando no válido.', ephemeral: true });
    }
  },
};

// --- Play ---
async function handlePlay(interaction) {
  const query = interaction.options.getString('query');
  const voiceChannel = interaction.member.voice.channel;

  if (!voiceChannel) {
    return interaction.reply({
      content: '❌ Debes estar en un canal de voz para usar este comando.',
      ephemeral: true,
    });
  }

  const permissions = voiceChannel.permissionsFor(interaction.client.user);
  if (!permissions.has('Connect') || !permissions.has('Speak')) {
    return interaction.reply({
      content: '❌ No tengo permisos para conectar o hablar en ese canal de voz.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  try {
    const player = useMainPlayer();
    const searchResult = await player.search(query, {
      requestedBy: interaction.user,
    });

    if (!searchResult || !searchResult.tracks.length) {
      return interaction.editReply({ content: '❌ No se encontraron resultados para tu búsqueda.' });
    }

    const track = searchResult.tracks[0];
    const replyText = `🔍 **${track.title}** - *${track.author}*`
      + (searchResult.tracks.length > 1 ? `\n📋 Se encontraron ${searchResult.tracks.length} resultados. Reproduciendo el primero.` : '');

    await interaction.editReply({ content: replyText });

    const queue = await player.play(voiceChannel, track, {
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

    const embed = createNowPlayingEmbed(queue, queue.currentTrack);
    await interaction.editReply({ content: null, embeds: [embed] });

  } catch (error) {
    logger.error('Error en music play:', error);
    let errorMsg = `❌ Error al reproducir: ${error.message}`;
    const isFfmpegIssue = error.message?.toLowerCase().includes('ffmpeg') || error.message?.toLowerCase().includes('encoder');
    if (isFfmpegIssue) {
      errorMsg = '❌ FFmpeg no está instalado. Asegúrate de que ffmpeg esté disponible en el sistema.';
    }
    try { await interaction.editReply({ content: errorMsg }); }
    catch { await interaction.followUp({ content: errorMsg, ephemeral: true }); }
  }
}

// --- Skip ---
async function handleSkip(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

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
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

  queue.delete();

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setDescription('🛑 Reproducción detenida. ¡Nos vemos!')
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// --- Queue ---
async function handleQueue(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

  const currentTrack = queue.currentTrack;
  const tracks = queue.tracks.toArray();
  const totalDuration = tracks.reduce((acc, t) => acc + (t.durationMS || 0), 0);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Cola de Reproducción')
    .setDescription(`**Reproduciendo ahora:**\n🎵 **[${currentTrack.title}](${currentTrack.url})** - *${currentTrack.author}*`)
    .setTimestamp();

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

  await interaction.reply({ embeds: [embed] });
}

// --- Now Playing ---
async function handleNowPlaying(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

  const embed = createNowPlayingEmbed(queue, queue.currentTrack);
  await interaction.reply({ embeds: [embed] });
}

// --- Pause ---
async function handlePause(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

  if (queue.node.isPaused()) {
    return interaction.reply({ content: '⚠️ Ya está pausada. Usa `/resume`.', ephemeral: true });
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
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

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

// --- Volume ---
async function handleVolume(interaction) {
  const queue = getQueue(interaction.guildId);
  if (!queue || !queue.isPlaying()) {
    return interaction.reply({ content: '❌ No hay nada reproduciéndose.', ephemeral: true });
  }

  const volume = interaction.options.getInteger('nivel');
  queue.node.setVolume(volume);

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setDescription(`🔊 Volumen ajustado a **${volume}%**`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

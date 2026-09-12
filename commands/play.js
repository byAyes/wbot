const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const {
  formatDurationMs,
  getSourceIcon,
  createNowPlayingEmbed,
  showTrackSelection,
  getDeezerTrackInfo,
  extractDeezerID,
  validateVoiceChannel,
  ensureKazagumoReady,
  getKazagumo,
  queueTracksForPlayback,
  logger,
} = require('../music/helpers');

function playbackErrorMessage(error) {
  const message = error?.message || String(error);
  const lower = message.toLowerCase();

  if (lower.includes('no nodes are online') || lower.includes('nodos lavalink')) {
    return 'Lavalink no tiene nodos online. Reinicia Lavalink y el bot, luego intenta de nuevo.';
  }
  if (lower.includes('voice connection') || lower.includes('connection is not established')) {
    return 'No pude unirme al canal de voz. Revisa que tenga permisos de Conectar/Hablar y que el canal no esté lleno.';
  }
  if (lower.includes('ffmpeg') || lower.includes('encoder')) {
    return 'FFmpeg no está disponible para reproducir audio.';
  }
  if (lower.includes('connect') || lower.includes('econnrefused') || lower.includes('socket')) {
    return 'No se pudo conectar bien con Lavalink. Revisa que el contenedor esté activo y reinicia el bot.';
  }
  if (lower.includes('youtube') || lower.includes('signature') || lower.includes('cipher')) {
    return 'YouTube rechazó la reproducción en Lavalink. Actualiza/reinicia el plugin de YouTube de Lavalink.';
  }

  return `Error al reproducir: ${message}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Reproduce música en tu canal de voz')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL')
        .setRequired(true)),

  async execute(interaction) {
    const voiceCheck = validateVoiceChannel(interaction);
    if (!voiceCheck.valid) {
      return interaction.reply({ content: voiceCheck.error, flags: MessageFlags.Ephemeral });
    }

    const { channel: voiceChannel } = voiceCheck;
    const query = interaction.options.getString('query');
    const deezerId = extractDeezerID(query);

    await interaction.deferReply();

    try {
      await ensureKazagumoReady(20000);
      const kazagumo = getKazagumo();

      if (deezerId) {
        await interaction.editReply({ content: 'Obteniendo información de Deezer...' });
        const trackInfo = await getDeezerTrackInfo(deezerId);

        await interaction.editReply({
          content: `Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
        });

        const searchResult = await kazagumo.search(`${trackInfo.artist} - ${trackInfo.title}`, {
          requester: interaction.user,
          engine: 'youtube',
        });

        if (!searchResult?.tracks?.length) {
          return interaction.editReply({ content: 'No encontré esa canción en YouTube.' });
        }

        let track = searchResult.tracks[0];
        if (searchResult.tracks.length > 1) {
          const selected = await showTrackSelection(interaction, searchResult.tracks);
          if (!selected) return;
          track = selected;
        }

        const player = await queueTracksForPlayback(interaction, voiceChannel, track);
        const embed = createNowPlayingEmbed(player, player.queue.current || track);
        return interaction.editReply({ content: null, components: [], embeds: [embed] });
      }

      const searchResult = await kazagumo.search(query, {
        requester: interaction.user,
      });

      if (!searchResult?.tracks?.length) {
        return interaction.editReply({ content: 'No encontré resultados para tu búsqueda.' });
      }

      if (searchResult.type === 'PLAYLIST') {
        const player = await queueTracksForPlayback(interaction, voiceChannel, searchResult.tracks);
        const playlistName = searchResult.playlistName || 'Playlist';
        const duration = searchResult.tracks.reduce((total, track) => total + (track.length || 0), 0);
        const thumbnailTrack = searchResult.tracks.find(track => track.thumbnail || track.artworkUrl);

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('Lista añadida a la cola')
          .setDescription(`**${playlistName}**`)
          .addFields(
            { name: 'Canciones', value: `${searchResult.tracks.length}`, inline: true },
            { name: 'Duración', value: formatDurationMs(duration), inline: true },
            { name: 'En cola', value: `${player.queue.length} pendientes`, inline: true },
          )
          .setTimestamp();

        if (thumbnailTrack) embed.setThumbnail(thumbnailTrack.thumbnail || thumbnailTrack.artworkUrl);
        return interaction.editReply({ embeds: [embed] });
      }

      let track = searchResult.tracks[0];
      if (searchResult.tracks.length > 1) {
        const selected = await showTrackSelection(interaction, searchResult.tracks);
        if (!selected) return;
        track = selected;
      }

      await interaction.editReply({
        content: `${getSourceIcon(track)} **${track.title || 'Sin título'}** - *${track.author || 'Desconocido'}*`,
        components: [],
      });

      const player = await queueTracksForPlayback(interaction, voiceChannel, track);
      const embed = createNowPlayingEmbed(player, player.queue.current || track);
      return interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      logger.error('Error en /play:', error);
      const errorMsg = playbackErrorMessage(error);

      try {
        return interaction.editReply({ content: errorMsg, components: [] });
      } catch {
        return interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
      }
    }
  },
};

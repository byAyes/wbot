const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  formatDurationMs,
  formatRepeatMode,
  getSourceIcon,
  createNowPlayingEmbed,
  showTrackSelection,
  getDeezerTrackInfo,
  extractDeezerID,
  validateVoiceChannel,
  validateQueue,
  useMainPlayer,
  QueryType,
  getPlayNodeOptions,
  logger,
} = require('../music/helpers');

// ========== COMMAND DEFINITION ==========

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Reproduce música en tu canal de voz (YouTube, Spotify, SoundCloud, Deezer)')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL (YouTube/Spotify/SoundCloud/Deezer)')
        .setRequired(true)),

  async execute(interaction) {
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
          const selected = await showTrackSelection(interaction, searchResult.tracks);
          if (!selected) return;
          track = selected;
        }

        await interaction.editReply({
          content: `📻 **${trackInfo.title}** - *${trackInfo.artist}* (Deezer → YouTube)`,
          components: [],
        });

        const { queue } = await player.play(voiceChannel, track, getPlayNodeOptions(interaction));

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
        const { queue } = await player.play(voiceChannel, searchResult, getPlayNodeOptions(interaction));

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
        const selected = await showTrackSelection(interaction, searchResult.tracks);
        if (!selected) return;
        track = selected;
      }

      await interaction.editReply({
        content: `${getSourceIcon(track)} **${track.title}** - *${track.author}*`,
        components: [],
      });

      const { queue } = await player.play(voiceChannel, track, getPlayNodeOptions(interaction));

      if (queue.currentTrack) {
        const embed = createNowPlayingEmbed(queue, queue.currentTrack);
        await interaction.editReply({ content: null, embeds: [embed] });
      }

    } catch (error) {
      logger.error('Error en /play:', error);
      let errorMsg = `❌ Error al reproducir: ${error.message}`;
      if (error.message?.toLowerCase().includes('ffmpeg') || error.message?.toLowerCase().includes('encoder')) {
        errorMsg = '❌ FFmpeg no está instalado. Asegúrate de que ffmpeg esté disponible en el sistema.';
      }
      try { await interaction.editReply({ content: errorMsg }); }
      catch { await interaction.followUp({ content: errorMsg, ephemeral: true }); }
    }
  },
};

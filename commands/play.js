const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
  formatDurationMs,
  getSourceIcon,
  createNowPlayingEmbed,
  showTrackSelection,
  getDeezerTrackInfo,
  extractDeezerID,
  validateVoiceChannel,
  getKazagumo,
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
      const kazagumo = getKazagumo();

      // --- Deezer URL: fetch track info, then search on YouTube via Lavalink ---
      if (deezerId) {
        await interaction.editReply({ content: '📻 Obteniendo información de Deezer...' });
        const trackInfo = await getDeezerTrackInfo(deezerId);

        await interaction.editReply({
          content: `🔍 Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
        });

        const searchResult = await kazagumo.search(`${trackInfo.artist} - ${trackInfo.title}`, {
          requester: interaction.user,
          engine: 'youtube',
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

        const player = await kazagumo.play(voiceChannel, track, {
          requester: interaction.user,
        });
        player.data = { channel: interaction.channel };

        if (player.currentTrack) {
          const embed = createNowPlayingEmbed(player, player.currentTrack);
          await interaction.editReply({ content: null, embeds: [embed] });
        }
        return;
      }

      // --- Normal search with Kazagumo (handles YT/Spotify/SC URLs automatically) ---
      const searchResult = await kazagumo.search(query, {
        requester: interaction.user,
      });

      if (!searchResult || !searchResult.tracks.length) {
        return interaction.editReply({ content: '❌ No se encontraron resultados para tu búsqueda.' });
      }

      // If it's a playlist
      if (searchResult.type === 'PLAYLIST') {
        const playlist = searchResult.playlist;
        const player = await kazagumo.play(voiceChannel, searchResult, {
          requester: interaction.user,
        });
        player.data = { channel: interaction.channel };

        const embed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('📑 Lista añadida a la cola')
          .setDescription(`**[${playlist.name || playlist.title}](${playlist.url || playlist.uri})**`)
          .addFields(
            { name: '👤 Autor', value: playlist.author || 'Desconocido', inline: true },
            { name: '🎵 Canciones', value: `${searchResult.tracks.length}`, inline: true },
            { name: '⏱️ Duración', value: formatDurationMs(playlist.duration || playlist.length || 0), inline: true },
          );

        if (playlist.thumbnail || playlist.artworkUrl) {
          embed.setThumbnail(playlist.thumbnail || playlist.artworkUrl);
        }
        embed.setTimestamp();

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

      const player = await kazagumo.play(voiceChannel, track, {
        requester: interaction.user,
      });
      player.data = { channel: interaction.channel };

      if (player.currentTrack) {
        const embed = createNowPlayingEmbed(player, player.currentTrack);
        await interaction.editReply({ content: null, embeds: [embed] });
      }

    } catch (error) {
      logger.error('Error en /play:', error);
      let errorMsg = `❌ Error al reproducir: ${error.message}`;
      if (error.message?.toLowerCase().includes('ffmpeg') || error.message?.toLowerCase().includes('encoder')) {
        errorMsg = '❌ FFmpeg no está instalado. Asegúrate de que ffmpeg esté disponible en el sistema.';
      } else if (error.message?.includes('connect') || error.message?.includes('ECONNREFUSED')) {
        errorMsg = '❌ No se pudo conectar al servidor Lavalink. Asegúrate de que esté ejecutándose.';
      }
      try { await interaction.editReply({ content: errorMsg }); }
      catch { await interaction.followUp({ content: errorMsg, ephemeral: true }); }
    }
  },
};

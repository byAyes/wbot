const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { apiCall } = require('../utils/api');
const logger = require('../utils/logger');

async function buscarSpotify(query) {
  const formattedQuery = encodeURIComponent(query).replace(/%20/g, '+');
  const apiUrl = `${process.env.API_URL}/search/spotify?query=${formattedQuery}&apikey=${process.env.API_KEY}`;
  const result = await apiCall(apiUrl);

  if (!result?.status || !result?.data?.length) {
    return [];
  }

  return result.data.map(track => ({
    title: track.title,
    artist: track.artist,
    album: track.album,
    duration: track.duration,
    url: track.url,
    image: track.image || '',
  }));
}

async function descargarSpotify(spotifyUrl) {
  const apiUrl = `${process.env.ALTERNATIVE_API_URL || 'https://api.siputzx.my.id'}/api/d/spotifyv2?url=${encodeURIComponent(spotifyUrl)}`;
  const result = await apiCall(apiUrl);

  if (!result.status || !result.data?.mp3DownloadLink) {
    throw new Error('No se pudo obtener el enlace de descarga de Spotify');
  }

  return {
    mp3Url: result.data.mp3DownloadLink,
    title: result.data.songTitle || 'Canción',
    artist: result.data.artist || 'Desconocido',
    image: result.data.image || '',
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Busca y descarga canciones de Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL de Spotify')
        .setRequired(true)),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    // Validate API URLs are configured
    if (!process.env.API_URL || !process.env.API_KEY) {
      return await interaction.reply({
        content: '❌ Las APIs de búsqueda no están configuradas. Asegúrate de que API_URL y API_KEY estén definidos en el archivo .env.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      // Check if it's a direct Spotify URL
      const spotifyUrlMatch = query.match(/https:\/\/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);

      if (spotifyUrlMatch) {
        await interaction.editReply({ content: '⏳ Obteniendo enlace de descarga de Spotify...' });

        const result = await descargarSpotify(spotifyUrlMatch[0]);
        const fullTitle = `${result.title} - ${result.artist}`;

        await interaction.editReply({ content: `⏳ Obteniendo **${fullTitle}**...` });

        await interaction.editReply({ content: `📤 Enviando **${fullTitle}**...` });

        await interaction.followUp({
          content: `✅ **${fullTitle}** - Aquí tienes tu audio:`,
          files: [{ attachment: result.mp3Url, name: `${fullTitle}.mp3` }],
        });
        return;
      }

      // Search mode
      await interaction.editReply({ content: `🔍 Buscando "${query}" en Spotify...` });

      const tracks = await buscarSpotify(query);

      if (!tracks.length) {
        return await interaction.editReply({ content: '❌ No se encontraron resultados en Spotify.' });
      }

      const track = tracks[0];
      const embed = new EmbedBuilder()
        .setColor(0x1DB954)
        .setTitle(`🎵 ${track.title}`)
        .setURL(track.url)
        .setThumbnail(track.image)
        .addFields(
          { name: '🎤 Artista', value: track.artist, inline: true },
          { name: '💿 Álbum', value: track.album, inline: true },
          { name: '⏳ Duración', value: track.duration, inline: true },
        )
        .setFooter({ text: 'Descargando...' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      await interaction.editReply({ content: '⏳ Obteniendo enlace de descarga...', embeds: [] });

      const result = await descargarSpotify(track.url);
      const fullTitle = `${result.title} - ${result.artist}`;

      await interaction.editReply({ content: `📤 Enviando **${fullTitle}**...` });
      await interaction.followUp({
        content: `🎵 Aquí tienes **${fullTitle}**:`,
        files: [{ attachment: result.mp3Url, name: `${fullTitle}.mp3` }],
      });

    } catch (error) {
      logger.error('Error en comando /spotify:', error);
      await interaction.editReply({ content: `❌ Error al procesar la solicitud: ${error.message}` });
    }
  },
};

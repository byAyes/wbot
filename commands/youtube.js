const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { apiCall, getFileSizeMB } = require('../utils/api');
const logger = require('../utils/logger');

const ALTERNATIVE_API_URL = process.env.ALTERNATIVE_API_URL || 'https://api.siputzx.my.id';

async function buscarPrimerVideoAPI(searchTerm) {
  // Primary API
  try {
    const primaryUrl = `${process.env.API_URL}/search/yt?query=${encodeURIComponent(searchTerm)}&apikey=${process.env.API_KEY}`;
    return await apiCall(primaryUrl);
  } catch (primaryError) {
    logger.warn('Primary YouTube search API failed:', primaryError.message);
    // Alternative API
    try {
      const altUrl = `${ALTERNATIVE_API_URL}/api/s/youtube?query=${encodeURIComponent(searchTerm)}`;
      const result = await apiCall(altUrl);
      if (result.status && result.result?.length) {
        return result;
      }
      throw new Error('No results from alternative API');
    } catch (altError) {
      throw new Error(`YouTube search failed: ${primaryError.message}`);
    }
  }
}

async function descargarAudioAPI(url) {
  try {
    const primaryUrl = `${process.env.API_URL}/dow/ytmp3v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`;
    return await apiCall(primaryUrl);
  } catch (primaryError) {
    logger.warn('Primary YouTube audio API failed:', primaryError.message);
    const altUrl = `${ALTERNATIVE_API_URL}/api/ytmp3?url=${encodeURIComponent(url)}`;
    return await apiCall(altUrl);
  }
}

async function descargarVideoAPI(url) {
  try {
    const primaryUrl = `${process.env.API_URL}/dow/ytmp4v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`;
    return await apiCall(primaryUrl);
  } catch (primaryError) {
    logger.warn('Primary YouTube video API failed:', primaryError.message);
    const altUrl = `${ALTERNATIVE_API_URL}/api/ytmp4?url=${encodeURIComponent(url)}`;
    return await apiCall(altUrl);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Busca y descarga audio/video de YouTube')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción/video o URL de YouTube')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('formato')
        .setDescription('Formato de descarga (por defecto: audio)')
        .setRequired(false)
        .addChoices(
          { name: 'Audio (MP3)', value: 'audio' },
          { name: 'Video (MP4)', value: 'video' },
        )),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const formato = interaction.options.getString('formato') || 'audio';

    // Validate API URLs are configured
    if (!process.env.API_URL || !process.env.API_KEY) {
      return await interaction.reply({
        content: '❌ Las APIs de descarga no están configuradas. Asegúrate de que API_URL y API_KEY estén definidos en el archivo .env.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      // Check if query is already a URL
      if (query.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i)) {
        // Direct URL download
        await interaction.editReply({ content: `⏳ Procesando enlace de YouTube...` });

        if (formato === 'audio') {
          const result = await descargarAudioAPI(query);
          if (!result.status || !result.data?.dl) {
            return await interaction.editReply({ content: '❌ No se pudo obtener el audio. Intenta con otro enlace.' });
          }
          const { dl, title } = result.data;
          await interaction.editReply({ content: `🎵 **${title}**\nDescargando audio...` });
          await interaction.followUp({ content: `🎵 Aquí tienes el audio:`, files: [{ attachment: dl, name: `${title}.mp3` }] });
        } else {
          const result = await descargarVideoAPI(query);
          if (!result.status || !result.data?.dl) {
            return await interaction.editReply({ content: '❌ No se pudo obtener el video. Intenta con otro enlace.' });
          }
          const { dl, title } = result.data;
          
          // Check file size
          const fileSizeMB = await getFileSizeMB(dl);
          if (fileSizeMB > 25) {
            return await interaction.editReply({ content: `❌ El video es demasiado grande (${fileSizeMB.toFixed(1)}MB). Límite de Discord: 25MB. Prueba con formato audio.` });
          }
          
          await interaction.editReply({ content: `🎬 **${title}**\nDescargando video...` });
          await interaction.followUp({ content: `🎬 Aquí tienes tu video:`, files: [{ attachment: dl, name: `${title}.mp4` }] });
        }
        return;
      }

      // Search
      await interaction.editReply({ content: `🔍 Buscando "${query}" en YouTube...` });

      const searchResult = await buscarPrimerVideoAPI(query);

      if (!searchResult.status || !searchResult.result?.length) {
        return await interaction.editReply({ content: '❌ No se encontraron resultados para tu búsqueda.' });
      }

      const firstResult = searchResult.result[0];
      const { title, autor, duration, url } = firstResult;

      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(`🎵 ${title}`)
        .setURL(url)
        .addFields(
          { name: '👤 Autor', value: autor || 'Desconocido', inline: true },
          { name: '⏳ Duración', value: duration || 'N/A', inline: true },
          { name: '📥 Formato', value: formato === 'audio' ? 'Audio (MP3)' : 'Video (MP4)', inline: true },
        )
        .setFooter({ text: 'Descargando, espera un momento...' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Download
      if (formato === 'audio') {
        const result = await descargarAudioAPI(url);
        if (!result.status || !result.data?.dl) {
          return await interaction.editReply({ content: `❌ No se pudo descargar **${title}**. Intenta de nuevo.` });
        }
        const { dl } = result.data;
        await interaction.editReply({ content: `✅ **${title}** descargado. Enviando audio...`, embeds: [] });
        await interaction.followUp({ content: `🎵 Aquí tienes el audio:`, files: [{ attachment: dl, name: `${title}.mp3` }] });
      } else {
        const result = await descargarVideoAPI(url);
        if (!result.status || !result.data?.dl) {
          return await interaction.editReply({ content: `❌ No se pudo descargar **${title}**. Intenta de nuevo.` });
        }
        const { dl } = result.data;
        
        // Check file size
        const fileSizeMB = await getFileSizeMB(dl);
        if (fileSizeMB > 25) {
          return await interaction.editReply({ content: `❌ El video **${title}** es demasiado grande (${fileSizeMB.toFixed(1)}MB). Límite: 25MB. Prueba con formato audio.`, embeds: [] });
        }
        
        await interaction.editReply({ content: `✅ **${title}** descargado. Enviando video...`, embeds: [] });
        await interaction.followUp({ content: `🎬 Aquí tienes tu video:`, files: [{ attachment: dl, name: `${title}.mp4` }] });
      }
    } catch (error) {
      logger.error('Error en comando /play:', error);
      await interaction.editReply({ content: `❌ Error al procesar la solicitud: ${error.message}` });
    }
  },
};

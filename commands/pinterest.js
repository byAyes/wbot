const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { apiCall } = require('../utils/api');
const logger = require('../utils/logger');

function normalizarUrlPinterest(url) {
  return url.replace(/\/\/([a-z]{2})\.pinterest\.com/, '//pinterest.com');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pinterest')
    .setDescription('Descarga imágenes/videos de Pinterest')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL del contenido de Pinterest')
        .setRequired(true)),

  async execute(interaction) {
    const url = interaction.options.getString('url');
    // Validate API URLs are configured
    if (!process.env.API_URL || !process.env.API_KEY) {
      return await interaction.reply({
        content: '❌ Las APIs de descarga no están configuradas. Revisa tu archivo .env.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      await interaction.editReply({ content: '⏳ Procesando enlace de Pinterest...' });

      const normalizedUrl = normalizarUrlPinterest(url);

      // Try primary API
      let dl, title, mediaType;
      let usedApi = 'primary';

      try {
        const primaryUrl = `${process.env.API_URL}/dow/pinterest?url=${encodeURIComponent(normalizedUrl)}&apikey=${process.env.API_KEY}`;
        const result = await apiCall(primaryUrl);
        if (result.status && result.data?.dl) {
          dl = result.data.dl;
          title = result.data.title || 'Contenido de Pinterest';
          mediaType = 'image';
        } else {
          throw new Error('Primary API no devolvió resultado');
        }
      } catch (primaryError) {
        logger.warn('Primary Pinterest API failed, trying alternative:', primaryError.message);
        usedApi = 'alternative';
        const altUrl = `${process.env.ALTERNATIVE_API_URL || 'https://api.siputzx.my.id'}/api/d/pinterest?url=${encodeURIComponent(normalizedUrl)}`;
        const result = await apiCall(altUrl);
        if (!result.status || !result.data?.media_urls?.length) {
          return await interaction.editReply({ content: '❌ No se pudo obtener el contenido de Pinterest.' });
        }
        dl = result.data.media_urls[0].url;
        title = result.data.title || 'Contenido de Pinterest';
        mediaType = result.data.media_urls[0].type === 'video' ? 'video' : 'image';
      }

      await interaction.editReply({ content: `📥 Descargando: **${title}**` });

      if (mediaType === 'video') {
        await interaction.followUp({
          content: `🎬 **${title}**`,
          files: [{ attachment: dl, name: `pinterest_video.mp4` }],
        });
      } else {
        await interaction.followUp({
          content: `🖼️ **${title}**`,
          files: [{ attachment: dl, name: `pinterest_image.jpg` }],
        });
      }

      const apiLabel = usedApi === 'primary' ? '✅' : '✅ (API alternativa)';
      await interaction.editReply({ content: `${apiLabel} Contenido de Pinterest enviado.` });
    } catch (error) {
      logger.error('Error en comando /pinterest:', error);
      await interaction.editReply({ content: `❌ Error al procesar: ${error.message}` });
    }
  },
};

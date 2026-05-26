const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { apiCall } = require('../utils/api');
const logger = require('../utils/logger');

const downloadDir = path.join(__dirname, '..', 'data', 'downloads');

// Ensure download directory exists
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Descarga videos/reels de Instagram')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL del contenido de Instagram')
        .setRequired(true)),

  async execute(interaction) {
    const url = interaction.options.getString('url');
    // Validate API URLs are configured
    if (!process.env.ALTERNATIVE_API_URL) {
      return await interaction.reply({
        content: '❌ ALTERNATIVE_API_URL no está configurado. Revisa tu archivo .env.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      await interaction.editReply({ content: '⏳ Descargando contenido de Instagram...' });

      const apiUrl = `${process.env.ALTERNATIVE_API_URL || 'https://api.siputzx.my.id'}/api/d/igdl?url=${encodeURIComponent(url)}`;
      const response = await apiCall(apiUrl);

      if (!response.status || !response.data?.length) {
        return await interaction.editReply({ content: '❌ No se pudo obtener el contenido de Instagram.' });
      }

      const media = response.data[0];
      const mediaUrl = media.url;
      const fileName = media.filename || `instagram_${Date.now()}.mp4`;
      const filePath = path.join(downloadDir, fileName);

      await interaction.editReply({ content: `📥 Descargando archivo...` });

      // Download the file
      const mediaResponse = await axios({
        url: mediaUrl,
        method: 'GET',
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(filePath);
      mediaResponse.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
      if (fileSizeMB > 25) {
        // Discord file limit is 25MB
        fs.unlinkSync(filePath);
        return await interaction.editReply({
          content: `❌ El archivo es demasiado grande (${fileSizeMB.toFixed(1)}MB). El límite de Discord es 25MB. Prueba con un enlace más corto.`,
        });
      }

      await interaction.editReply({ content: `📤 Enviando video...` });
      await interaction.followUp({
        content: `📱 Aquí tienes tu video de Instagram:`,
        files: [{ attachment: filePath, name: fileName }],
      });

      await interaction.editReply({ content: `✅ Video de Instagram enviado correctamente.` });

      // Cleanup file after sending
      setTimeout(() => {
        fs.unlink(filePath, (err) => {
          if (err) logger.warn('Error deleting Instagram file:', err.message);
        });
      }, 5000);

    } catch (error) {
      logger.error('Error en comando /instagram:', error);
      await interaction.editReply({ content: `❌ Error al descargar de Instagram: ${error.message}` });
    }
  },
};

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const axios = require('axios');
const { exec } = require('child_process');
const logger = require('../utils/logger');

const downloadDir = path.join(__dirname, '..', 'data', 'downloads');

if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

function esArchivoValido(filePath) {
  return new Promise((resolve) => {
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (error) => {
      resolve(!error);
    });
  });
}

async function descargarConAxios(url, outputPath) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'stream',
    timeout: 60000,
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  await new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('download')
    .setDescription('Descarga contenido multimedia desde un enlace directo')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL directa del archivo multimedia')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('formato')
        .setDescription('Formato de descarga')
        .setRequired(false)
        .addChoices(
          { name: 'Audio (MP3)', value: 'audio' },
          { name: 'Video (MP4)', value: 'video' },
        )),

  async execute(interaction) {
    const url = interaction.options.getString('url');
    const formato = interaction.options.getString('formato') || 'video';
    await interaction.deferReply();

    try {
      await interaction.editReply({ content: '⏳ Procesando enlace...' });

      const archivoBase = `media_${Date.now()}`;
      const extensionFinal = formato === 'audio' ? '.mp3' : '.mp4';
      let archivoFinal = path.join(downloadDir, `${archivoBase}${extensionFinal}`);

      // Download via Axios (works for direct media URLs)
      try {
        await interaction.editReply({ content: '⏳ Descargando...' });
        await descargarConAxios(url, archivoFinal);
      } catch (axiosError) {
        throw new Error(`No se pudo descargar: ${axiosError.message}`);
      }

      if (!fs.existsSync(archivoFinal)) {
        return await interaction.editReply({ content: '❌ No se pudo descargar el archivo.' });
      }

      const fileSizeMB = fs.statSync(archivoFinal).size / (1024 * 1024);
      if (fileSizeMB > 25) {
        fs.unlinkSync(archivoFinal);
        return await interaction.editReply({
          content: `❌ El archivo es demasiado grande (${fileSizeMB.toFixed(1)}MB). Límite: 25MB.`,
        });
      }

      // Validate file
      const esValido = await esArchivoValido(archivoFinal);
      if (!esValido) {
        fs.unlinkSync(archivoFinal);
        return await interaction.editReply({ content: '❌ El archivo descargado no es válido o está corrupto.' });
      }

      // Convert if needed
      const ext = path.extname(archivoFinal).toLowerCase();
      if ((formato === 'audio' && ext !== '.mp3') || (formato === 'video' && ext !== '.mp4')) {
        await interaction.editReply({ content: '⏳ Convirtiendo formato...' });
        const archivoConvertido = path.join(downloadDir, `${archivoBase}_convertido${extensionFinal}`);

        await new Promise((resolve, reject) => {
          ffmpeg(archivoFinal)
            .toFormat(formato === 'audio' ? 'mp3' : 'mp4')
            .on('end', resolve)
            .on('error', reject)
            .save(archivoConvertido);
        });

        fs.unlinkSync(archivoFinal);
        archivoFinal = archivoConvertido;
      }

      // Send file
      await interaction.editReply({ content: `📤 Enviando ${formato}...` });

      const attachmentName = `descarga_${Date.now()}${extensionFinal}`;
      if (formato === 'audio') {
        await interaction.followUp({
          content: '🎵 Aquí tienes tu audio:',
          files: [{ attachment: archivoFinal, name: attachmentName }],
        });
      } else {
        await interaction.followUp({
          content: '🎬 Aquí tienes tu video:',
          files: [{ attachment: archivoFinal, name: attachmentName }],
        });
      }

      await interaction.editReply({ content: '✅ Archivo enviado correctamente.' });

      // Cleanup
      setTimeout(() => {
        fs.unlink(archivoFinal, (err) => {
          if (err) logger.warn('Error deleting temp file:', err.message);
        });
      }, 5000);

    } catch (error) {
      logger.error('Error en comando /download:', error);
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  },
};

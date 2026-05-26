const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { json } = require('@distube/yt-dlp');
const logger = require('../utils/logger');

// --- Helpers ---

const YTDLP_FLAGS = {
  dumpSingleJson: true,
  noWarnings: true,
  noCallHome: true,
  skipDownload: true,
  simulate: true,
};

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'En vivo';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function extractYouTubeID(text) {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/**
 * Searches YouTube using yt-dlp's built-in search
 */
async function searchYouTube(query) {
  const result = await json(`ytsearch10:${query}`, {
    ...YTDLP_FLAGS,
    flatPlaylist: false,

  });

  if (!result || !result.entries || result.entries.length === 0) {
    throw new Error('No se encontraron resultados');
  }

  // Filter only video entries with valid URLs
  const videos = result.entries.filter(
    e => e && e.webpage_url && e.title && e.duration > 0
  );

  if (videos.length === 0) {
    throw new Error('No se encontraron videos');
  }

  return videos[0]; // Return best match
}

/**
 * Gets a direct download URL for a YouTube video using yt-dlp
 */
async function getDownloadURL(videoUrl, format = 'ba/ba*') {
  const info = await json(videoUrl, {
    ...YTDLP_FLAGS,
    format,
  });

  if (!info || !info.url) {
    throw new Error('No se pudo obtener la URL de descarga');
  }

  return {
    downloadUrl: info.url,
    title: info.title || info.fulltitle || 'Desconocido',
    duration: info.duration || 0,
    uploader: info.uploader || info.channel || 'Desconocido',
    uploaderUrl: info.uploader_url || info.channel_url || '',
    thumbnail: info.thumbnail || info.thumbnails?.[0]?.url || '',
  };
}

/**
 * Estimates file size from download URL headers
 */
async function estimateFileSize(url) {
  try {
    const https = require('https');
    const http = require('http');
    const protocol = url.startsWith('https') ? https : http;

    return new Promise(resolve => {
      const req = protocol.request(url, { method: 'HEAD', timeout: 8000 }, res => {
        const len = parseInt(res.headers['content-length'] || '0', 10);
        res.destroy();
        resolve(len > 0 ? len / (1024 * 1024) : 0);
      });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.end();
    });
  } catch {
    return 0;
  }
}

// --- Command Definition ---

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Busca y descarga audio/video de YouTube (usando yt-dlp)')
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

    await interaction.deferReply();

    try {
      const isUrl = extractYouTubeID(query);

      // --- Step 1: Get video info ---
      let videoUrl, videoTitle, uploader, duration, thumbnail;

      if (isUrl) {
        // Direct URL — get info from yt-dlp
        videoUrl = query.startsWith('http') ? query : `https://youtube.com/watch?v=${isUrl}`;
        await interaction.editReply({ content: '⏳ Obteniendo información del video...' });

        const info = await json(videoUrl, YTDLP_FLAGS);
        videoTitle = info.title || 'Desconocido';
        uploader = info.uploader || info.channel || 'Desconocido';
        duration = info.duration || 0;
        thumbnail = info.thumbnail || info.thumbnails?.[0]?.url || '';
      } else {
        // Search
        await interaction.editReply({ content: `🔍 Buscando "${query}" en YouTube...` });
        const video = await searchYouTube(query);
        videoUrl = video.webpage_url;
        videoTitle = video.title;
        uploader = video.uploader || video.channel || 'Desconocido';
        duration = video.duration || 0;
        thumbnail = video.thumbnail || video.thumbnails?.[0]?.url || '';
      }

      // --- Step 2: Show embed ---
      const embed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle(videoTitle.length > 80 ? videoTitle.substring(0, 77) + '...' : videoTitle)
        .setURL(videoUrl)
        .setThumbnail(thumbnail)
        .addFields(
          { name: '👤 Autor', value: uploader, inline: true },
          { name: '⏳ Duración', value: formatDuration(duration), inline: true },
          { name: '📥 Formato', value: formato === 'audio' ? '🎵 Audio' : '🎬 Video', inline: true },
        )
        .setFooter({ text: '⬇️ Obteniendo enlace de descarga...' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // --- Step 3: Get download URL ---
      const formatSelector = formato === 'audio' ? 'ba/ba*' : 'best[height<=720]';
      const fileExt = formato === 'audio' ? 'mp3' : 'mp4';

      const downloadInfo = await getDownloadURL(videoUrl, formatSelector);
      const downloadUrl = downloadInfo.downloadUrl;

      // --- Step 4: Check file size for video ---
      if (formato === 'video') {
        const sizeMB = await estimateFileSize(downloadUrl);
        const maxSize = 25; // Discord free upload limit

        if (sizeMB > maxSize) {
          // Try audio-only as fallback
          logger.warn(`Video too large (${sizeMB.toFixed(1)}MB), falling back to audio`);
          const audioInfo = await getDownloadURL(videoUrl, 'ba/ba*');
          const audioUrl = audioInfo.downloadUrl;

          await interaction.editReply({
            content: `⚠️ El video es muy grande (${sizeMB.toFixed(1)}MB, límite ${maxSize}MB).\n⬇️ Enviando solo el audio en su lugar:`,
            embeds: [],
          });
          await interaction.followUp({
            content: `🎵 **${downloadInfo.title}** — Audio:`,
            files: [{ attachment: audioUrl, name: `${downloadInfo.title}.mp3` }],
          });
          return;
        }
      }

      // --- Step 5: Send file ---
      await interaction.editReply({
        content: `✅ **${downloadInfo.title}** — Enviando ${formato === 'audio' ? 'audio' : 'video'}...`,
        embeds: [],
      });

      await interaction.followUp({
        content: formato === 'audio' ? '🎵 Aquí tienes el audio:' : '🎬 Aquí tienes el video:',
        files: [{ attachment: downloadUrl, name: `${downloadInfo.title}.${fileExt}` }],
      });

    } catch (error) {
      logger.error('Error en comando /play:', error);

      // User-friendly error messages
      let userMessage = `❌ Error al procesar la solicitud: ${error.message}`;

      if (error.code === 'ENOENT' || error.message?.includes('spawn') || error.message?.includes('ENOENT')) {
        userMessage = '❌ yt-dlp no está instalado. Ejecuta `npm install` para descargarlo.';
      } else if (error.message?.includes('ytsearch') || error.message?.includes('No se encontr')) {
        userMessage = '❌ No se encontraron resultados para tu búsqueda.';
      } else if (error.message?.includes('HTTP Error 429') || error.message?.includes('Too Many Requests')) {
        userMessage = '❌ YouTube está limitando solicitudes temporalmente. Intenta de nuevo en unos minutos.';
      } else if (error.message?.includes('HTTP Error 403')) {
        userMessage = '❌ YouTube bloqueó la solicitud. Intenta de nuevo más tarde.';
      }

      await interaction.editReply({ content: userMessage });
    }
  },
};

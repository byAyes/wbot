const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { json } = require('@distube/yt-dlp');
const axios = require('axios');
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

function extractSpotifyID(text) {
  const match = text.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

function isSoundCloudUrl(text) {
  return /(?:https?:\/\/)?(?:www\.)?soundcloud\.com\//.test(text);
}

/**
 * Fetches track info from Spotify oEmbed API
 */
async function getSpotifyTrackInfo(spotifyUrl) {
  const { data } = await axios.get('https://open.spotify.com/oembed', {
    params: { url: spotifyUrl },
    timeout: 10000,
  });
  return {
    title: data.title,
    artist: data.author_name,
    thumbnail: data.thumbnail_url,
  };
}

/**
 * Searches YouTube using yt-dlp's built-in search, returns up to 5 results
 */
async function searchYouTube(query) {
  const result = await json(`ytsearch5:${query}`, {
    ...YTDLP_FLAGS,
    flatPlaylist: false,
  });

  if (!result || !result.entries || result.entries.length === 0) {
    throw new Error('No se encontraron resultados en YouTube');
  }

  const videos = result.entries.filter(
    e => e && e.webpage_url && e.title && e.duration > 0
  );

  if (videos.length === 0) {
    throw new Error('No se encontraron videos en YouTube');
  }

  return videos.slice(0, 5);
}

/**
 * Searches SoundCloud using yt-dlp's built-in search, returns up to 5 results
 */
async function searchSoundCloud(query) {
  const result = await json(`scsearch5:${query}`, {
    ...YTDLP_FLAGS,
    flatPlaylist: false,
  });

  if (!result || !result.entries || result.entries.length === 0) {
    throw new Error('No se encontraron resultados en SoundCloud');
  }

  const tracks = result.entries.filter(
    e => e && e.webpage_url && e.title
  );

  if (tracks.length === 0) {
    throw new Error('No se encontraron tracks en SoundCloud');
  }

  return tracks.slice(0, 5);
}

/**
 * Gets media info from a URL using yt-dlp (works for YouTube, SoundCloud, etc.)
 */
async function getMediaInfo(url) {
  return json(url, YTDLP_FLAGS);
}

/**
 * Gets a direct download URL for media
 */
async function getDownloadURL(mediaUrl, format = 'ba/ba*') {
  const info = await json(mediaUrl, {
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
 * Shows a select menu with search results and returns the selected item.
 * If only 1 result, returns it directly without showing the menu.
 */
async function showTrackSelection(interaction, tracks) {
  if (!tracks || tracks.length === 0) return null;
  if (tracks.length === 1) return tracks[0];

  const select = new StringSelectMenuBuilder()
    .setCustomId('track_select')
    .setPlaceholder('🎯 Selecciona el resultado correcto')
    .addOptions(
      tracks.map((track, i) => ({
        label: (track.title || 'Desconocido').substring(0, 100),
        description: `${(track.uploader || track.channel || 'Desconocido').substring(0, 50)} — ${formatDuration(track.duration || 0)}`,
        value: String(i),
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);

  const message = await interaction.editReply({
    content: `🔍 Se encontraron ${tracks.length} resultados. **Selecciona el correcto** (30s):`,
    components: [row],
  });

  try {
    const collected = await message.awaitMessageComponent({
      filter: i => i.user.id === interaction.user.id,
      time: 30000,
    });
    const selectedIndex = parseInt(collected.values[0]);
    await collected.update({ components: [] });
    return tracks[selectedIndex];
  } catch {
    await interaction.editReply({
      content: '⏰ Tiempo agotado. Usa `/play` de nuevo.',
      components: [],
    });
    return null;
  }
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
    .setDescription('Busca y descarga música/video de YouTube, SoundCloud y Spotify')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción/video o URL (YouTube, Spotify, SoundCloud)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('formato')
        .setDescription('Formato de descarga (por defecto: audio)')
        .setRequired(false)
        .addChoices(
          { name: 'Audio (MP3)', value: 'audio' },
          { name: 'Video (MP4)', value: 'video' },
        ))
    .addStringOption(option =>
      option.setName('fuente')
        .setDescription('Fuente de búsqueda (se auto-detecta si es una URL)')
        .setRequired(false)
        .addChoices(
          { name: 'YouTube', value: 'youtube' },
          { name: 'SoundCloud', value: 'soundcloud' },
        )),

  async execute(interaction) {
    const query = interaction.options.getString('query');
    const formato = interaction.options.getString('formato') || 'audio';
    const fuenteRaw = interaction.options.getString('fuente');
    const fuenteExplicit = fuenteRaw !== null; // user explicitly selected a source
    const fuente = fuenteRaw || 'youtube';

    // --- Pre-validate: video only works for YouTube ---
    const spotifyTrackId = extractSpotifyID(query);
    const isSoundCloud = isSoundCloudUrl(query);
    const isYouTubeUrl = extractYouTubeID(query);

    if (formato === 'video' && (spotifyTrackId || isSoundCloud || (!isYouTubeUrl && fuente === 'soundcloud'))) {
      return interaction.reply({
        content: '❌ El formato **video** solo está disponible para YouTube. SoundCloud y Spotify solo permiten audio.',
        ephemeral: true,
      });
    }

    // --- Guard: only block mismatched fuente/URL if user explicitly chose the source ---
    if (fuenteExplicit && fuente === 'soundcloud' && isYouTubeUrl) {
      return interaction.reply({
        content: '❌ La URL es de YouTube, pero seleccionaste SoundCloud como fuente. Usa `/play` sin especificar fuente para que se auto-detecte.',
        ephemeral: true,
      });
    }
    if (fuenteExplicit && fuente === 'youtube' && isSoundCloud) {
      return interaction.reply({
        content: '❌ La URL es de SoundCloud, pero seleccionaste YouTube como fuente. Usa `/play` sin especificar fuente para que se auto-detecte.',
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      let mediaUrl, mediaTitle, uploader, duration, thumbnail, fuenteActual;

      // --- Case 1: Spotify URL → oEmbed → search YouTube ---
      if (spotifyTrackId) {
        fuenteActual = 'spotify';
        await interaction.editReply({ content: '🎵 Obteniendo información de Spotify...' });

        const trackInfo = await getSpotifyTrackInfo(`https://open.spotify.com/track/${spotifyTrackId}`);

        await interaction.editReply({
          content: `🔍 Buscando "${trackInfo.title}" de ${trackInfo.artist} en YouTube...`,
        });

        const videos = await searchYouTube(`${trackInfo.artist} - ${trackInfo.title}`);
        const selected = await showTrackSelection(interaction, videos);
        if (!selected) return;
        mediaUrl = selected.webpage_url;
        mediaTitle = `${trackInfo.title} — ${trackInfo.artist}`;
        uploader = selected.uploader || selected.channel || 'Desconocido';
        duration = selected.duration || 0;
        thumbnail = trackInfo.thumbnail || selected.thumbnail || selected.thumbnails?.[0]?.url || '';
      }

      // --- Case 2: SoundCloud URL or fuente=soundcloud ---
      else if (isSoundCloud || fuente === 'soundcloud') {
        fuenteActual = 'soundcloud';

        if (isSoundCloud) {
          // Direct SoundCloud URL
          await interaction.editReply({ content: '☁️ Obteniendo información de SoundCloud...' });
          const info = await getMediaInfo(query);
          mediaUrl = query;
          mediaTitle = info.title || 'Desconocido';
          uploader = info.uploader || info.channel || 'Desconocido';
          duration = info.duration || 0;
          thumbnail = info.thumbnail || info.thumbnails?.[0]?.url || '';
        } else {
          // Search SoundCloud
          await interaction.editReply({ content: `☁️ Buscando "${query}" en SoundCloud...` });
          const tracks = await searchSoundCloud(query);
          const selected = await showTrackSelection(interaction, tracks);
          if (!selected) return;
          mediaUrl = selected.webpage_url;
          mediaTitle = selected.title;
          uploader = selected.uploader || selected.channel || 'Desconocido';
          duration = selected.duration || 0;
          thumbnail = selected.thumbnail || selected.thumbnails?.[0]?.url || '';
        }
      }

      // --- Case 3: YouTube (default) ---
      else {
        fuenteActual = 'youtube';

        if (isYouTubeUrl) {
          // Direct YouTube URL
          mediaUrl = query.startsWith('http') ? query : `https://youtube.com/watch?v=${isYouTubeUrl}`;
          await interaction.editReply({ content: '⏳ Obteniendo información del video...' });
          const info = await getMediaInfo(mediaUrl);
          mediaTitle = info.title || 'Desconocido';
          uploader = info.uploader || info.channel || 'Desconocido';
          duration = info.duration || 0;
          thumbnail = info.thumbnail || info.thumbnails?.[0]?.url || '';
        } else {
          // Search YouTube
          await interaction.editReply({ content: `🔍 Buscando "${query}" en YouTube...` });
          const videos = await searchYouTube(query);
          const selected = await showTrackSelection(interaction, videos);
          if (!selected) return;
          mediaUrl = selected.webpage_url;
          mediaTitle = selected.title;
          uploader = selected.uploader || selected.channel || 'Desconocido';
          duration = selected.duration || 0;
          thumbnail = selected.thumbnail || selected.thumbnails?.[0]?.url || '';
        }
      }

      // --- Show embed ---
      const embedColor = fuenteActual === 'soundcloud' ? 0xFF7700 : (fuenteActual === 'spotify' ? 0x1DB954 : 0xFF0000);
      const fuenteEmoji = fuenteActual === 'soundcloud' ? '☁️' : (fuenteActual === 'spotify' ? '🎵' : '▶️');
      const fuenteNombre = fuenteActual === 'soundcloud' ? 'SoundCloud' : (fuenteActual === 'spotify' ? 'Spotify' : 'YouTube');

      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(mediaTitle.length > 80 ? mediaTitle.substring(0, 77) + '...' : mediaTitle)
        .setURL(mediaUrl)
        .setThumbnail(thumbnail)
        .addFields(
          { name: '👤 Autor', value: uploader, inline: true },
          { name: '⏳ Duración', value: formatDuration(duration), inline: true },
          { name: '📥 Formato', value: formato === 'audio' ? '🎵 Audio' : '🎬 Video', inline: true },
          { name: '🌐 Fuente', value: `${fuenteEmoji} ${fuenteNombre}`, inline: true },
        )
        .setFooter({ text: '⬇️ Obteniendo enlace de descarga...' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // --- Get download URL ---
      const formatSelector = formato === 'audio' ? 'ba/ba*' : 'best[height<=720]';
      const fileExt = formato === 'audio' ? 'mp3' : 'mp4';

      const downloadInfo = await getDownloadURL(mediaUrl, formatSelector);
      const downloadUrl = downloadInfo.downloadUrl;

      // --- Check file size for video ---
      if (formato === 'video') {
        const sizeMB = await estimateFileSize(downloadUrl);
        const maxSize = 25;

        if (sizeMB > maxSize) {
          logger.warn(`Video too large (${sizeMB.toFixed(1)}MB), falling back to audio`);
          const audioInfo = await getDownloadURL(mediaUrl, 'ba/ba*');
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

      // --- Send file ---
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

      let userMessage = `❌ Error al procesar la solicitud: ${error.message}`;

      if (error.code === 'ENOENT' || error.message?.includes('spawn') || error.message?.includes('ENOENT')) {
        userMessage = '❌ yt-dlp no está instalado. Ejecuta `npm install` para descargarlo.';
      } else if (error.message?.includes('HTTP Error 429') || error.message?.includes('Too Many Requests')) {
        userMessage = '❌ El servicio está limitando solicitudes temporalmente. Intenta de nuevo en unos minutos.';
      } else if (error.message?.includes('HTTP Error 403')) {
        userMessage = '❌ El servicio bloqueó la solicitud. Intenta de nuevo más tarde.';
      }

      await interaction.editReply({ content: userMessage });
    }
  },
};

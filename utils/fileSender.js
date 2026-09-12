/**
 * FileSender - Centralized file sending logic for Discord interactions
 * Eliminates duplication across spotify.js, pinterest.js, instagram.js, download.js, music.js
 */
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DOWNLOAD_DIR = path.join(__dirname, '..', 'data', 'downloads');
const DISCORD_MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

/**
 * Validates that a file is within Discord's size limit
 * @param {string} filePath - Absolute path to file
 * @returns {object} { valid: boolean, sizeMB: number, error?: string }
 */
function validateFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    if (stats.size > DISCORD_MAX_FILE_SIZE) {
      return { valid: false, sizeMB, error: `El archivo es demasiado grande (${sizeMB.toFixed(1)}MB, límite 25MB).` };
    }
    return { valid: true, sizeMB };
  } catch (error) {
    return { valid: false, sizeMB: 0, error: `No se pudo verificar el archivo: ${error.message}` };
  }
}

/**
 * Cleans up a file after a delay
 * @param {string} filePath
 * @param {number} delayMs - Default 5000ms
 */
function scheduleCleanup(filePath, delayMs = 5000) {
  setTimeout(() => {
    fs.unlink(filePath, (err) => {
      if (err) logger.debug(`Cleanup failed for ${filePath}: ${err.message}`);
    });
  }, delayMs);
}

/**
 * Sends a file as a followUp message to an interaction
 * @param {object} interaction - Discord.js interaction
 * @param {object} options
 * @param {string} options.attachment - URL or file path
 * @param {string} options.name - Filename
 * @param {string} options.content - Message content
 * @param {string} options.kind - 'audio' | 'video' | 'image' | 'generic'
 * @returns {Promise<void>}
 */
async function sendFile(interaction, { attachment, name, content, kind = 'generic' }) {
  const prefixes = {
    audio: '🎵 Aquí tienes tu audio:',
    video: '🎬 Aquí tienes tu video:',
    image: '🖼️ Aquí tienes tu imagen:',
    generic: '📥 Aquí tienes tu archivo:',
  };

  await interaction.followUp({
    content: content || prefixes[kind] || prefixes.generic,
    files: [{ attachment, name }],
  });
}

/**
 * Sends a file via editReply + followUp pattern (common pattern in commands)
 * @param {object} interaction
 * @param {object} options
 */
async function sendFileWithStatus(interaction, {
  attachment, name, content, kind = 'generic',
  processingText = '⏳ Procesando...', successText = '✅ Enviado', errorText = '❌ Error al enviar',
}) {
  try {
    await interaction.editReply({ content: processingText });
    await sendFile(interaction, { attachment, name, content, kind });
    await interaction.editReply({ content: successText });
    return true;
  } catch (error) {
    logger.error('Error sending file:', error.message);
    await interaction.editReply({ content: `${errorText}: ${error.message}` });
    return false;
  }
}

/**
 * Creates an AttachmentBuilder from a file path
 * @param {string} filePath
 * @param {string} filename
 * @returns {AttachmentBuilder}
 */
function createAttachmentFromPath(filePath, filename) {
  return new AttachmentBuilder(fs.readFileSync(filePath), { name: filename });
}

/**
 * Downloads a file from a URL to disk
 * @param {string} url
 * @param {string} outputPath
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
async function downloadToFile(url, outputPath, timeoutMs = 60000) {
  const axios = require('axios');
  const response = await axios({
    url, method: 'GET', responseType: 'stream', timeout: timeoutMs,
  });
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

module.exports = {
  validateFileSize,
  scheduleCleanup,
  sendFile,
  sendFileWithStatus,
  createAttachmentFromPath,
  downloadToFile,
  DOWNLOAD_DIR,
  DISCORD_MAX_FILE_SIZE,
};
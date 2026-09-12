/**
 * ErrorHandler - Unified error handling for Discord commands
 * Classifies errors and returns consistent user-facing messages
 */
const logger = require('./logger');

const ERROR_PATTERNS = [
  {
    pattern: /no nodes are online|nodos lavalink/i,
    message: 'Lavalink no tiene nodos online. Reinicia Lavalink y el bot, luego intenta de nuevo.',
  },
  {
    pattern: /voice connection|connection is not established/i,
    message: 'No pude unirme al canal de voz. Revisa que tenga permisos de Conectar/Hablar y que el canal no esté lleno.',
  },
  {
    pattern: /ffmpeg|encoder/i,
    message: 'FFmpeg no está disponible para procesar audio/video.',
  },
  {
    pattern: /econnrefused|socket hang up|connect e/i,
    message: 'No se pudo conectar con el servicio de música. Intenta de nuevo más tarde.',
  },
  {
    pattern: /youtube.*signature|youtube.*cipher|signatur/i,
    message: 'YouTube rechazó la reproducción. Actualiza/reinicia el plugin de YouTube de Lavalink.',
  },
  {
    pattern: /http error 429|too many requests/i,
    message: 'El servicio está limitando solicitudes temporalmente. Intenta de nuevo en unos minutos.',
  },
  {
    pattern: /http error 403|forbidden/i,
    message: 'El servicio bloqueó la solicitud. Intenta de nuevo más tarde.',
  },
  {
    pattern: /http error 404|not found/i,
    message: 'No se encontró el contenido solicitado.',
  },
  {
    pattern: /ENOENT|spawn.*ENOENT/i,
    message: 'yt-dlp no está instalado o no se encuentra. Ejecuta npm install.',
  },
  {
    pattern: /video.*large|too large/i,
    message: 'El video es demasiado grande para enviar por Discord (límite 25MB).',
  },
  {
    pattern: /token|api key|api_key|unauthorized/i,
    message: 'Error de autenticación con el servicio. Contacta al administrador.',
  },
];

/**
 * Classifies an error and returns a user-friendly message
 * @param {Error} error - The error to classify
 * @param {object} context - Optional context { command, userId }
 * @returns {string} User-friendly error message
 */
function classifyError(error, context = {}) {
  const message = error?.message || String(error);
  const lower = message.toLowerCase();

  for (const { pattern, message: userMsg } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return userMsg;
    }
  }

  // Fallback: return a sanitized version of the original message
  // Avoid leaking stack traces or internal paths
  const sanitized = message
    .replace(/\/[^\s]*\/node_modules[^\s]*/g, '[módulo]')
    .replace(/C:\\[^\s]*/g, '[ruta]')
    .replace(/\/[^\s]*/g, (m) => m.length > 40 ? '[ruta]' : m);

  return `Error al procesar la solicitud: ${sanitized.substring(0, 200)}`;
}

/**
 * Handles an error in a Discord interaction, sending a user-friendly response
 * @param {object} interaction - Discord.js interaction
 * @param {Error} error - The error that occurred
 * @param {object} options - { commandName, loggerContext, fallbackMessage }
 * @returns {Promise<void>}
 */
async function handleInteractionError(interaction, error, options = {}) {
  const { commandName = 'unknown', fallbackMessage = '❌ Ocurrió un error inesperado.' } = options;

  logger.error(`Error in ${commandName}:`, error.message);

  const userMessage = classifyError(error, { command: commandName });

  const reply = { content: userMessage, flags: 8 }; // 8 = Ephemeral

  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: userMessage, components: [] }).catch(() => {});
      // If editReply fails (already acknowledged differently), try followUp
      if (!interaction.replied) {
        await interaction.followUp({ ...reply, flags: 8 }).catch(() => {});
      }
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  } catch (replyError) {
    logger.error('Failed to send error response:', replyError.message);
    try {
      await interaction.followUp({ content: fallbackMessage, flags: 8 }).catch(() => {});
    } catch {
      // Last resort: nothing we can do
    }
  }
}

/**
 * Wraps an async command handler with error handling
 * @param {Function} handler - The command's execute function
 * @param {string} commandName - Name of the command for logging
 * @returns {Function} Wrapped handler
 */
function withErrorHandling(handler, commandName) {
  return async function (...args) {
    const interaction = args[0];
    try {
      return await handler.apply(this, args);
    } catch (error) {
      await handleInteractionError(interaction, error, { commandName });
    }
  };
}

module.exports = {
  classifyError,
  handleInteractionError,
  withErrorHandling,
};
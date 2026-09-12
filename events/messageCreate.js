const { EmbedBuilder } = require('discord.js');
const AIService = require('../services/aiService');
const IntentClassifier = require('../services/intentClassifier');
const KnowledgeBase = require('../services/knowledgeBase');
const { getLimiter, formatRateLimitMessage } = require('../utils/rateLimiter');
const db = require('../database/setup');

const aiService = new AIService();
const intentClassifier = new IntentClassifier();
const knowledgeBase = new KnowledgeBase();

const SYSTEM_PROMPT = `Eres Carlos, asistente de Discord amigable y útil. 
Personalidad: cálido, casual, emojis moderadamente, siempre en español.
Conoces todos los comandos: /play, /music, /spotify, /pinterest, /instagram, /download, /birthday, /reminder, /chat, /help, /weather, /poll, /ping, /invite, /ask, /hos.
Cuando no sepas algo, usa la base de conocimiento o di que no sabes.
Mantén respuestas cortas (máximo 280 caracteres cuando sea posible).
NUNCA des información sensible ni reveles internals del bot.`;
const logger = require('../utils/logger');
const { renderDiscordMessage } = require('../utils/messageRenderer');
const {
  isAlreadyInHallOfShame,
  addHallOfShameEntry,
  getGuildConfig,
  addConversationMessage,
  getConversationHistory,
} = require('../database/setup');

// Rate limiting: cooldown per user (30 seconds)
const cooldowns = new Map();
const COOLDOWN_MS = 30_000;

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore bot messages
    if (message.author.bot) return;

    // Check if bot was mentioned
    if (!message.mentions.has(client.user)) return;

    // === AI CHAT (when NOT a reply) ===
    if (!message.reference?.messageId) {
      return handleAIChat(message, client);
    }

    // === HALL OF SHAME (when reply + mention) ===
    return handleHallOfShame(message, client);
  },
};

// =====================================================================
//  AI CHAT HANDLER - Hybrid routing
// =====================================================================
async function handleAIChat(message, client) {
  const userId = message.author.id;
  const content = message.content.replace(/<@\d+>/g, '').trim();

  if (!content) {
    await message.reply({
      content: '👋 ¡Hola! ¿En qué puedo ayudarte? Usa `/help` para ver los comandos o pregúntame algo directamente.',
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  // Rate limit check
  const limiter = getLimiter('ai');
  const { allowed, resetIn } = limiter.check(userId);
  if (!allowed) {
    await message.reply({
      content: formatRateLimitMessage({ resetIn }, 'msg'),
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  // Show typing indicator
  try { await message.channel.sendTyping(); } catch {}

  try {
    // Classify intent
    const classification = intentClassifier.classify(content);
    logger.debug(`AI Chat intent: ${classification.intent} (conf: ${classification.confidence})`);

    // If it's a known command with high confidence, route to it
    if (classification.command && classification.confidence >= 0.5) {
      const routed = await routeToCommand(message, classification, content);
      if (routed) return;
    }

    // Otherwise, use LLM
    if (!aiService.isConfigured()) {
      await message.reply({
        content: '⚠️ La IA no está configurada. Añade OPENAI_API_KEY (o GROQ_API_KEY/ANTHROPIC_API_KEY) en el archivo .env.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // Get conversation history
    const history = getConversationHistory(userId, 6);

    // Search knowledge base for context
    const relevantChunks = knowledgeBase.search(content, 2);
    const context = relevantChunks.length > 0
      ? `\n\nContexto de la base de conocimiento:\n${relevantChunks.join('\n---\n')}`
      : '';

    // Build messages array
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + context },
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: content },
    ];

    // Call LLM
    const result = await aiService.chat(messages);

    // Store conversation
    addConversationMessage(userId, 'user', content, message.guild?.id, message.channelId, classification.intent);
    addConversationMessage(userId, 'assistant', result.content, message.guild?.id, message.channelId, classification.intent, result.tokensUsed);

    // Build response embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(result.content)
      .setFooter({ text: `🤖 ${aiService.provider} • ${result.tokensUsed} tokens` })
      .setTimestamp();

    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });

  } catch (error) {
    logger.error('Error en AI chat:', error.message);
    await message.reply({
      content: `❌ Error al procesar tu mensaje: ${error.message}`,
      allowedMentions: { repliedUser: false },
    });
  }
}

/**
 * Routes a classified intent to a helpful response
 */
async function routeToCommand(message, classification, content) {
  const { command } = classification;

  const routingMessages = {
    play: '🎵 Detecté que quieres reproducir música. Usa el comando `/play <query>` directamente para mejores resultados.',
    download: '📥 Detecté que quieres descargar. Usa `/download <url>` o `/music download <query>`.',
    reminder: '⏰ Detecté que quieres un recordatorio. Usa `/reminder set <fecha> <mensaje>`.',
    birthday: '🎂 Detecté que hablas de cumpleaños. Usa `/birthday` para gestionarlos.',
    help: '📚 Usa `/help` para ver todos los comandos disponibles.',
    invite: '🔗 Usa `/invite` para obtener el enlace de invitación.',
    utility: '🔧 Usa `/ping` para ver la latencia del bot.',
    weather: '🌤️ Usa `/weather <ciudad>` para ver el clima.',
    poll: '📊 Usa `/poll` para crear una encuesta.',
    hos: '🏆 Para usar el Hall of Shame, responde a un mensaje mencionándome.',
  };

  if (routingMessages[command]) {
    await message.reply({
      content: routingMessages[command],
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  return false;
}

// =====================================================================
//  HALL OF SHAME HANDLER (existing logic)
// =====================================================================
async function handleHallOfShame(message, client) {
    const config = getGuildConfig(message.guild.id);
    if (!config.hos_enabled) return;
    if (!config.hos_channel_id) {
      try {
        await message.react('⚠️');
        const reply = await message.reply({
          content: '⚠️ El Hall of Shame no está configurado en este servidor. Un admin debe usar `/hos setup channel` primero.',
          allowedMentions: { repliedUser: false },
        });
        setTimeout(() => reply.delete().catch(() => {}), 8000);
      } catch {}
      return;
    }

    // Rate limit check
    const now = Date.now();
    const lastUsed = cooldowns.get(message.author.id);
    if (lastUsed && (now - lastUsed) < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - lastUsed)) / 1000);
      try {
        await message.react('⏳');
        const reply = await message.reply({
          content: `⏳ Espera ${remaining} segundos antes de nominar a alguien de nuevo.`,
          allowedMentions: { repliedUser: false },
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {}
      return;
    }

    // Try to fetch the referenced (quoted) message
    let quotedMessage;
    try {
      quotedMessage = await message.channel.messages.fetch(message.reference.messageId);
    } catch {
      try {
        await message.react('❌');
        const reply = await message.reply({
          content: '❌ No se pudo encontrar el mensaje al que respondes. Quizás fue eliminado.',
          allowedMentions: { repliedUser: false },
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {}
      return;
    }

    // Don't allow quoting bot messages
    if (quotedMessage.author.bot) {
      try { await message.react('🤖'); } catch {}
      return;
    }

    // Self-nomination: solo permitido para el owner del bot
    const ownerId = process.env.BOT_OWNER_ID;
    if (quotedMessage.author.id === message.author.id && message.author.id !== ownerId) {
      try {
        await message.react('🙅');
        const reply = await message.reply({
          content: '🙅 No puedes nominarte a ti mismo al Hall of Shame.',
          allowedMentions: { repliedUser: false },
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {}
      return;
    }

    // Check for duplicates
    if (isAlreadyInHallOfShame(quotedMessage.id)) {
      try {
        await message.react('🔄');
        const reply = await message.reply({
          content: '🔄 Este mensaje ya está en el Hall of Shame.',
          allowedMentions: { repliedUser: false },
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
      } catch {}
      return;
    }

    // React with a random emoji from the quoted message (like cBot2 does)
    try { await quotedMessage.react('💀'); } catch {}

    // Fetch the HOS channel
    let hosChannel;
    try {
      hosChannel = await client.channels.fetch(config.hos_channel_id);
    } catch {
      logger.error('No se pudo encontrar el canal de Hall of Shame:', config.hos_channel_id);
      try { await message.react('⚠️'); } catch {}
      return;
    }

    // Set cooldown
    cooldowns.set(message.author.id, now);

    // Send "processing" feedback (like cBot2)
    const processingMsg = await message.reply('🖼️ Creando la imagen del Hall of Shame...');

    try {
      // Render the message as an image
      const { attachment } = await renderDiscordMessage(quotedMessage);

      const messageUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${quotedMessage.id}`;

      // Build embed (like cBot2 style)
      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setAuthor({ name: '--- 𝕳𝖆𝖑𝖑 𝕺𝖋 𝕾𝖍𝖆𝖒𝖊 ---' })
        .setTitle(`${quotedMessage.author.username} (${quotedMessage.author.id})`)
        .addFields(
          { name: 'Author', value: `<@${quotedMessage.author.id}>`, inline: true },
          { name: 'Channel', value: `<#${quotedMessage.channel.id}>`, inline: true },
          { name: 'Jump to message', value: `[Jump to Message](${messageUrl})`, inline: true },
        )
        .setImage('attachment://message.png')
        .setFooter({
          text: `❤️ ~${message.guild?.name || 'Servidor'} • ${new Date(quotedMessage.createdTimestamp).toLocaleString('es-ES')}`,
          iconURL: message.guild?.iconURL({ dynamic: true }) || null,
        });

      // Role ping (if configured)
      let content = null;
      const allowedMentions = { roles: [], repliedUser: false };
      if (config.hos_role_id) {
        const roleExists = hosChannel.guild?.roles.cache.has(config.hos_role_id);
        if (roleExists) {
          content = `<@&${config.hos_role_id}>`;
          allowedMentions.roles = [config.hos_role_id];
        }
      }

      // Send to HOS channel
      const hosMessage = await hosChannel.send({ content, embeds: [embed], files: [attachment], allowedMentions });

      // React with emojis
      await hosMessage.react('🏆');
      await hosMessage.react('🔥');
      await hosMessage.react('💀');

      // React to the user's message confirming it was posted
      try { await message.react('💀'); } catch {}
      try { await message.react('🏆'); } catch {}

      // Edit processing message to done (like cBot2)
      await processingMsg.edit('✅ Hecho 🟢');

      // Cleanup: delete only the bot's processing message after 3s
      setTimeout(() => {
        processingMsg.delete().catch(() => {});
      }, 3000);

      // Save to database
      addHallOfShameEntry({
        quotedMessageId: quotedMessage.id,
        quotedUserId: quotedMessage.author.id,
        quotedUsername: quotedMessage.author.tag,
        quotedContent: (quotedMessage.content || '').slice(0, 1000),
        quotedChannelId: quotedMessage.channel.id,
        quotedMessageUrl: messageUrl,
        nominatedById: message.author.id,
        nominatedByUsername: message.author.tag,
        guildId: message.guild.id,
      });

      logger.info(`🏆 HOS: "${(quotedMessage.content || '').slice(0, 50)}..." nominado por ${message.author.tag}`);
    } catch (error) {
      logger.error('Error al procesar Hall of Shame:', error.message);
      cooldowns.delete(message.author.id);

      // Fallback: try to send as text embed if image rendering failed
      try {
        await processingMsg.edit('⚠️ No se pudo generar la imagen. Enviando como texto...');

        const quotedContent = quotedMessage.content || '';
        const messageUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${quotedMessage.id}`;

        const fallbackEmbed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('🏆 Hall of Shame')
          .setDescription(quotedContent || '*[Mensaje sin texto]*')
          .setAuthor({
            name: quotedMessage.author.tag,
            iconURL: quotedMessage.author.displayAvatarURL({ dynamic: true }),
          })
          .addFields(
            { name: 'Canal original', value: `<#${quotedMessage.channel.id}>`, inline: true },
            { name: 'Nominado por', value: message.author.toString(), inline: true },
            { name: 'Ir al mensaje', value: `[Click aquí](${messageUrl})`, inline: true },
          )
          .setFooter({ text: `❤️ ~${message.guild?.name || 'Servidor'}` })
          .setTimestamp();

        // Include image if present
        const firstAttach = quotedMessage.attachments?.first();
        if (firstAttach?.contentType?.startsWith('image/')) {
          fallbackEmbed.setImage(firstAttach.url);
        }

        const hosMessage = await hosChannel.send({ embeds: [fallbackEmbed] });
        await hosMessage.react('🏆');
        await hosMessage.react('🔥');
        await hosMessage.react('💀');

        await processingMsg.edit('✅ Hecho 🟢 (modo texto)');
        setTimeout(() => {
          processingMsg.delete().catch(() => {});
        }, 3000);

        addHallOfShameEntry({
          quotedMessageId: quotedMessage.id,
          quotedUserId: quotedMessage.author.id,
          quotedUsername: quotedMessage.author.tag,
          quotedContent: quotedContent.slice(0, 1000),
          quotedChannelId: quotedMessage.channel.id,
          quotedMessageUrl: messageUrl,
          nominatedById: message.author.id,
          nominatedByUsername: message.author.tag,
          guildId: message.guild.id,
        });
      } catch (fallbackError) {
        logger.error('Error también en fallback:', fallbackError.message);
        await processingMsg.edit('❌ Error al enviar al Hall of Shame.').catch(() => {});
        try { await message.react('❌'); } catch {}
      }
    }
  }

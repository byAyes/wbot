/**
 * /chat - Hybrid AI chat command
 * Routes to LLM for conversational queries, or to existing commands for structured tasks
 */
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const AIService = require('../services/aiService');
const IntentClassifier = require('../services/intentClassifier');
const KnowledgeBase = require('../services/knowledgeBase');
const { getLimiter, formatRateLimitMessage } = require('../utils/rateLimiter');
const db = require('../database/setup');
const logger = require('../utils/logger');

const aiService = new AIService();
const intentClassifier = new IntentClassifier();
const knowledgeBase = new KnowledgeBase();

const SYSTEM_PROMPT = `Eres Carlos, un asistente de Discord amigable y útil. 
Tu personalidad: cálido, casual, usando emojis moderadamente, siempre en español.
Conoces todos los comandos del bot: /play, /music, /spotify, /pinterest, /instagram, /download, /birthday, /reminder, /chat, /help, /hos, /ping, /invite.
Cuando un usuario haga una pregunta que no sepas, usa /help como referencia o di que no sabes.
Mantén las respuestas cortas (máximo 280 caracteres cuando sea posible).
NUNCA des información sensible ni reveles internals del bot.`;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('🤖 Habla con la IA de Carlos')
    .addStringOption(option =>
      option.setName('pregunta')
        .setDescription('Tu pregunta o comando en lenguaje natural')
        .setRequired(true)
        .setMaxLength(500)),

  async execute(interaction) {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const question = interaction.options.getString('pregunta');

    // Rate limit check
    const limiter = getLimiter('ai');
    const { allowed, resetIn } = limiter.check(userId);
    if (!allowed) {
      return interaction.reply({
        content: formatRateLimitMessage({ resetIn }, 'msg'),
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();

    try {
      // Classify intent
      const classification = intentClassifier.classify(question);
      logger.debug(`Chat intent: ${classification.intent} (conf: ${classification.confidence})`);

      // If it's a known command with high confidence, route to it
      if (classification.command && classification.confidence >= 0.5) {
        const routed = await routeToCommand(interaction, classification, question);
        if (routed) return;
      }

      // Otherwise, use LLM
      if (!aiService.isConfigured()) {
        return interaction.editReply({
          content: '⚠️ La IA no está configurada. Añade OPENAI_API_KEY (o GROQ_API_KEY/ANTHROPIC_API_KEY) en el archivo .env.',
        });
      }

      // Get conversation history
      const history = db.getConversationHistory(userId, 6);

      // Search knowledge base for context
      const relevantChunks = knowledgeBase.search(question, 2);
      const context = relevantChunks.length > 0
        ? `\n\nContexto de la base de conocimiento:\n${relevantChunks.join('\n---\n')}`
        : '';

      // Build messages array
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + context },
        ...history.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: question },
      ];

      // Call LLM
      const result = await aiService.chat(messages);

      // Store conversation
      db.addConversationMessage(userId, 'user', question, guildId, interaction.channelId, classification.intent);
      db.addConversationMessage(userId, 'assistant', result.content, guildId, interaction.channelId, classification.intent, result.tokensUsed);

      // Build response embed
      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(result.content)
        .setFooter({ text: `🤖 ${aiService.provider} • ${result.tokensUsed} tokens` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error('Error en /chat:', error.message);
      await interaction.editReply({
        content: `❌ Error al procesar tu pregunta: ${error.message}`,
      });
    }
  },
};

/**
 * Routes a classified intent to the appropriate command
 */
async function routeToCommand(interaction, classification, question) {
  const { intent, command } = classification;

  const routingMessages = {
    play: '🎵 Detecté que quieres reproducir música. Usa el comando `/play <query>` directamente para mejor resultados.',
    download: '📥 Detecté que quieres descargar. Usa `/download <url>` o `/music download <query>`.',
    reminder: '⏰ Detecté que quieres un recordatorio. Usa `/reminder set <fecha> <mensaje>`.',
    birthday: '🎂 Detecté que hablas de cumpleaños. Usa `/birthday` para gestionarlos.',
    help: '📚 Usa `/help` para ver todos los comandos disponibles.',
    utility: '🔧 Usa los comandos de utilidad como `/ping` para ver la latencia.',
  };

  if (routingMessages[command]) {
    await interaction.editReply({
      content: routingMessages[command],
      components: [],
    });
    return true;
  }

  return false;
}
/**
 * /ask - Quick AI question (alias for /chat with simpler interface)
 */
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const AIService = require('../services/aiService');
const KnowledgeBase = require('../services/knowledgeBase');
const { getLimiter, formatRateLimitMessage } = require('../utils/rateLimiter');
const db = require('../database/setup');
const logger = require('../utils/logger');

const aiService = new AIService();
const knowledgeBase = new KnowledgeBase();

const SYSTEM_PROMPT = `Eres Carlos, asistente de Discord. Responde siempre en español, de forma amigable y concisa (máximo 280 caracteres). Usa emojis moderadamente. Si no sabes algo, admítelo.`;

module.exports = {
data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('❓ Haz una pregunta rápida a la IA')
    .addStringOption(option =>
      option.setName('pregunta')
        .setDescription('Tu pregunta')
        .setRequired(true)
        .setMaxLength(500)),

  async execute(interaction) {
    const userId = interaction.user.id;
    const question = interaction.options.getString('pregunta');

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
      if (!aiService.isConfigured()) {
        return interaction.editReply({
          content: '⚠️ IA no configurada. Añade OPENAI_API_KEY en .env',
        });
      }

      const relevantChunks = knowledgeBase.search(question, 2);
      const context = relevantChunks.length > 0
        ? `\n\nContexto:\n${relevantChunks.join('\n---\n')}`
        : '';

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT + context },
        { role: 'user', content: question },
      ];

      const result = await aiService.chat(messages);

      db.addConversationMessage(userId, 'user', question, interaction.guildId, interaction.channelId);
      db.addConversationMessage(userId, 'assistant', result.content, interaction.guildId, interaction.channelId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
        .setDescription(result.content)
        .setFooter({ text: `🤖 ${aiService.provider} • ${result.tokensUsed} tokens` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      logger.error('Error en /ask:', error.message);
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  },
};
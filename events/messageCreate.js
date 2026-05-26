const { EmbedBuilder } = require('discord.js');
const logger = require('../utils/logger');
const { renderDiscordMessage } = require('../utils/messageRenderer');
const {
  isAlreadyInHallOfShame,
  addHallOfShameEntry,
  getGuildConfig,
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

    // Check if message is a reply
    if (!message.reference?.messageId) return;

    // Get per-guild configuration
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

    // Don't allow self-nomination
    if (quotedMessage.author.id === message.author.id) {
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
  },
};

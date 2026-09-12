/**
 * /reminder - Set and manage reminders
 */
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const db = require('../database/setup');
const { getLimiter, formatRateLimitMessage } = require('../utils/rateLimiter');
const logger = require('../utils/logger');

// Reference to the ReminderService instance (set by index.js)
let reminderService = null;

function setReminderService(service) {
  reminderService = service;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('⏰ Gestiona recordatorios')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Configura un recordatorio')
        .addStringOption(option =>
          option.setName('fecha')
            .setDescription('Formato: DD-MM-YYYY HH:MM (ej: 25-12-2024 15:30)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('mensaje')
            .setDescription('El mensaje del recordatorio (máx 200 caracteres)')
            .setRequired(true)
            .setMaxLength(200)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Muestra tus recordatorios pendientes'))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Elimina un recordatorio')
        .addIntegerOption(option =>
          option.setName('id')
            .setDescription('ID del recordatorio a eliminar')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    switch (subcommand) {
      case 'set': return handleSet(interaction, userId, guildId, channelId);
      case 'list': return handleList(interaction, userId);
      case 'delete': return handleDelete(interaction, userId);
      default:
        return interaction.reply({ content: '❌ Subcomando no válido.', flags: MessageFlags.Ephemeral });
    }
  },
};

function setReminderServiceExport(service) {
  setReminderService(service);
}

async function handleSet(interaction, userId, guildId, channelId) {
  const fechaStr = interaction.options.getString('fecha');
  const mensaje = interaction.options.getString('mensaje');

  // Parse date: DD-MM-YYYY HH:MM
  const dateMatch = fechaStr.match(/(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!dateMatch) {
    return interaction.reply({
      content: '❌ Formato incorrecto. Usa: DD-MM-YYYY HH:MM (ej: 25-12-2024 15:30)',
      flags: MessageFlags.Ephemeral,
    });
  }

  const day = parseInt(dateMatch[1]);
  const month = parseInt(dateMatch[2]);
  const year = parseInt(dateMatch[3]);
  const hours = parseInt(dateMatch[4]);
  const minutes = parseInt(dateMatch[5]);

  // Validate
  const remindDate = new Date(year, month - 1, day, hours, minutes);
  if (isNaN(remindDate.getTime())) {
    return interaction.reply({ content: '❌ Fecha inválida.', flags: MessageFlags.Ephemeral });
  }

  if (remindDate <= new Date()) {
    return interaction.reply({
      content: '❌ La fecha debe ser futura.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Check max reminders
  const existing = db.getUserReminders(userId, 100);
  if (existing.length >= 50) {
    return interaction.reply({
      content: '❌ Has alcanzado el límite de 50 recordatorios pendientes.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const result = db.createReminder(userId, guildId, channelId, mensaje, remindDate.toISOString());

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('⏰ Recordatorio configurado')
      .setDescription(mensagem)
      .addFields(
        { name: 'Fecha', value: remindDate.toLocaleString('es-ES'), inline: true },
        { name: '-ID-', value: String(result.lastInsertRowid), inline: true },
      )
      .setFooter({ text: `Recordatorio #${result.lastInsertRowid}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // Schedule the reminder
    if (reminderService) {
      reminderService.scheduleReminder({
        id: result.lastInsertRowid,
        user_id: userId,
        guild_id: guildId,
        channel_id: channelId,
        message: mensaje,
        remind_at: remindDate.toISOString(),
      });
    }

    logger.info(`Recordatorio creado: ${result.lastInsertRowid} para ${userId} en ${remindDate}`);
  } catch (error) {
    logger.error('Error creando recordatorio:', error.message);
    await interaction.reply({ content: '❌ Error al crear el recordatorio.', flags: MessageFlags.Ephemeral });
  }
}

async function handleList(interaction, userId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const reminders = db.getUserReminders(userId, 50);

    if (reminders.length === 0) {
      return interaction.editReply({ content: '📭 No tienes recordatorios pendientes.' });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('⏰ Tus Recordatorios')
      .setTimestamp();

    reminders.forEach((r, i) => {
      const date = new Date(r.remind_at).toLocaleString('es-ES');
      embed.addFields({
        name: `#${r.id} - ${date}`,
        value: r.message,
        inline: false,
      });
    });

    embed.setFooter({ text: `Total: ${reminders.length} recordatorios` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error listando recordatorios:', error.message);
    await interaction.editReply({ content: '❌ Error al mostrar los recordatorios.' });
  }
}

async function handleDelete(interaction, userId) {
  const reminderId = interaction.options.getInteger('id');

  try {
    const result = db.deleteReminder(reminderId, userId);

    if (result.changes === 0) {
      return interaction.reply({
        content: '❌ No encontré ese recordatorio.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Cancel the scheduled reminder
    if (reminderService) {
      reminderService.cancel(reminderId);
    }

    await interaction.reply({
      content: `✅ Recordatorio #${reminderId} eliminado.`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    logger.error('Error eliminando recordatorio:', error.message);
    await interaction.reply({ content: '❌ Error al eliminar el recordatorio.', flags: MessageFlags.Ephemeral });
  }
}

// Export for index.js to set the service reference
module.exports.setReminderService = setReminderServiceExport;
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { setBirthday, getUpcomingBirthdays, getBirthdayByUserId, deleteBirthday } = require('../database/setup');
const logger = require('../utils/logger');

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function getMonthName(num) {
  return MONTHS[num - 1] || 'desconocido';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Gestiona tus cumpleaños')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Guarda tu fecha de cumpleaños')
        .addStringOption(option =>
          option.setName('fecha')
            .setDescription('Tu fecha de cumpleaños (DD-MM-YYYY)')
            .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Muestra los próximos cumpleaños'))
    .addSubcommand(sub =>
      sub.setName('get')
        .setDescription('Muestra tu cumpleaños guardado'))
    .addSubcommand(sub =>
      sub.setName('delete')
        .setDescription('Elimina tu cumpleaños guardado')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set':
        return handleSet(interaction);
      case 'list':
        return handleList(interaction);
      case 'get':
        return handleGet(interaction);
      case 'delete':
        return handleDelete(interaction);
      default:
        return interaction.reply({ content: '❌ Subcomando no válido.', flags: MessageFlags.Ephemeral });
    }
  },
};

async function handleSet(interaction) {
  const dateStr = interaction.options.getString('fecha');
  const dateParts = dateStr.split('-');

  if (dateParts.length !== 3) {
    return interaction.reply({
      content: '❌ Formato incorrecto. Usa: DD-MM-YYYY (ejemplo: 22-11-2004)',
      flags: MessageFlags.Ephemeral,
    });
  }

  const day = parseInt(dateParts[0], 10);
  const month = parseInt(dateParts[1], 10);
  const year = parseInt(dateParts[2], 10);

  if (isNaN(day) || isNaN(month) || isNaN(year)) {
    return interaction.reply({
      content: '❌ La fecha contiene caracteres no válidos. Usa: DD-MM-YYYY',
      flags: MessageFlags.Ephemeral,
    });
  }    if (month < 1 || month > 12) {
      return interaction.reply({ content: '❌ El mes debe estar entre 1 y 12.', flags: MessageFlags.Ephemeral });
    }

  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return interaction.reply({
      content: `❌ El día debe estar entre 1 y ${daysInMonth} para el mes ${getMonthName(month)}.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    const result = setBirthday(
      interaction.user.id,
      interaction.user.username,
      day, month, year,
    );

    const monthName = getMonthName(month);
    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('🎂 Cumpleaños Guardado')
      .setDescription(
        result.action === 'updated'
          ? `✅ He actualizado tu cumpleaños a: **${day} de ${monthName} de ${year}**`
          : `✅ ¡He guardado tu cumpleaños! Te recordaré el **${day} de ${monthName}**.`
      )
      .setFooter({ text: interaction.user.tag })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error saving birthday:', error);
    await interaction.reply({ content: '❌ Error al guardar tu cumpleaños.', flags: MessageFlags.Ephemeral });
  }
}

async function handleList(interaction) {
  await interaction.deferReply();

  try {
    const birthdays = getUpcomingBirthdays(15);

    if (!birthdays.length) {
      return await interaction.editReply({ content: '📭 No hay cumpleaños guardados todavía.' });
    }

    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('🎂 Próximos Cumpleaños')
      .setDescription('Estos son los próximos cumpleaños registrados:')
      .setTimestamp();

    birthdays.forEach(entry => {
      const monthName = getMonthName(entry.month);
      const daysText = entry.remainingDays === 0
        ? '🎉 ¡Hoy!'
        : `Faltan ${entry.remainingDays} día${entry.remainingDays !== 1 ? 's' : ''}`;
      embed.addFields({
        name: `${entry.day} de ${monthName}`,
        value: `<@${entry.user_id}> - ${daysText}`,
        inline: false,
      });
    });

    embed.setFooter({ text: `Total: ${birthdays.length} cumpleaños` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error listing birthdays:', error);
    await interaction.editReply({ content: '❌ Error al mostrar los cumpleaños.' });
  }
}

async function handleGet(interaction) {
  try {
    const entry = getBirthdayByUserId(interaction.user.id);

    if (!entry) {
      return interaction.reply({
        content: '📭 No tienes un cumpleaños guardado. Usa `/birthday set DD-MM-YYYY` para guardarlo.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const monthName = getMonthName(entry.month);
    const embed = new EmbedBuilder()
      .setColor(0xFF69B4)
      .setTitle('🎂 Tu Cumpleaños')
      .setDescription(`Tu cumpleaños es el **${entry.day} de ${monthName} de ${entry.year}**`)
      .setFooter({ text: interaction.user.tag })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    logger.error('Error getting birthday:', error);
    await interaction.reply({ content: '❌ Error al obtener tu cumpleaños.', flags: MessageFlags.Ephemeral });
  }
}

async function handleDelete(interaction) {
  try {
    const result = deleteBirthday(interaction.user.id);

    if (result.changes === 0) {
      return interaction.reply({
        content: '📭 No tienes un cumpleaños guardado.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ content: '✅ Tu cumpleaños ha sido eliminado.', flags: MessageFlags.Ephemeral });
  } catch (error) {
    logger.error('Error deleting birthday:', error);
    await interaction.reply({ content: '❌ Error al eliminar tu cumpleaños.', flags: MessageFlags.Ephemeral });
  }
}

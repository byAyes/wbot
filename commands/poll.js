/**
 * /poll - Create an interactive poll with reactions
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('📊 Crea una encuesta con botones de reacción')
    .addStringOption(option =>
      option.setName('pregunta')
        .setDescription('La pregunta de la encuesta')
        .setRequired(true)
        .setMaxLength(200))
    .addStringOption(option =>
      option.setName('opciones')
        .setDescription('Opciones separadas por coma (máx 5, ej: "Sí, No, Tal vez")')
        .setRequired(false)
        .setMaxLength(200)),

  async execute(interaction) {
    const pregunta = interaction.options.getString('pregunta');
    const opcionesStr = interaction.options.getString('opciones');

    let opciones = ['✅', '❌', '🤔'];
    if (opcionesStr) {
      opciones = opcionesStr.split(',').map(o => o.trim()).filter(o => o.length > 0).slice(0, 5);
      // Pad with emojis if less than 2
      const emojis = ['✅', '❌', '🤔', '👍', '👎'];
      while (opciones.length < 2) opciones.push(emojis[opciones.length % emojis.length]);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Encuesta')
      .setDescription(pregunta)
      .addFields(
        opciones.map((opt, i) => ({ name: `${i + 1}`, value: opt, inline: true }))
      )
      .setFooter({ text: `Creada por ${interaction.user.username}` })
      .setTimestamp();

    const message = await interaction.reply({ embeds: [embed], fetchReply: true });

    // Add reactions
    const reactionEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    for (let i = 0; i < Math.min(opciones.length, 5); i++) {
      await message.react(reactionEmojis[i]).catch(() => {});
    }

    // Add a "vote results" button
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`poll_results_${message.id}`)
          .setLabel('📊 Ver resultados')
          .setStyle(ButtonStyle.Secondary),
      );

    await message.edit({ components: [row] });
  },
};
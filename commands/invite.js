const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Envía el enlace de invitación para agregar el bot a otros servidores'),

  async execute(interaction) {
    const clientId = process.env.CLIENT_ID;
    const permissions = '8'; // Administrador

    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Invita a Nautilus')
      .setDescription(
        '¡Agrega **Nautilus** a tu servidor y disfruta de:\n\n' +
        '🎵 Descarga música y videos de YouTube, Spotify\n' +
        '🖼️ Descarga de Instagram, Pinterest\n' +
        '🏆 Sistema de Hall of Shame\n' +
        '🎂 Recordatorio de cumpleaños\n' +
        '🎶 Música en canales de voz\n' +
        '¡Y mucho más!'
      )
      .setFooter({ text: 'Haz clic en el botón de abajo para invitar' })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('➕ Invitar Nautilus')
          .setStyle(ButtonStyle.Link)
          .setURL(inviteUrl),
        new ButtonBuilder()
          .setLabel('🌐 Soporte')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/users/${clientId}`),
      );

    await interaction.reply({ embeds: [embed], components: [row] });
  },
};

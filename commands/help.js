const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos disponibles'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📚 Comandos de Nautilus')
      .setDescription('Bot multimedia con descargas y utilidades')
      .addFields(
        {
          name: '🎵 Música y Video',
          value:
            '`/play <query> [formato]` - Busca y descarga de YouTube\n' +
            '`/spotify <query>` - Busca y descarga de Spotify\n' +
            '`/download <url> [formato]` - Descarga desde enlace directo',
          inline: false,
        },
        {
          name: '🖼️ Redes Sociales',
          value:
            '`/pinterest <url>` - Descarga de Pinterest\n' +
            '`/instagram <url>` - Descarga de Instagram',
          inline: false,
        },
        {
          name: '🎵 Música en Voz',
          value:
            '`/music play <query>` - Reproduce música en canal de voz\n' +
            '`/music skip` - Salta a la siguiente canción\n' +
            '`/music stop` - Detiene la música y sale del canal\n' +
            '`/music queue` - Muestra la cola de reproducción\n' +
            '`/music nowplaying` - Muestra la canción actual\n' +
            '`/music pause` - Pausa la reproducción\n' +
            '`/music resume` - Reanuda la reproducción\n' +
            '`/music volume <1-100>` - Ajusta el volumen',
          inline: false,
        },
        {
          name: '🎂 Utilidades',
          value:
            '`/birthday set <DD-MM-YYYY>` - Guarda tu cumpleaños\n' +
            '`/birthday list` - Muestra próximos cumpleaños\n' +
            '`/birthday get` - Muestra tu cumpleaños\n' +
            '`/birthday delete` - Elimina tu cumpleaños\n' +
            '`/ping` - Muestra la latencia del bot\n' +
            '`/reload [comando]` - 🔄 Recarga comandos sin reiniciar (Owner)',
          inline: false,
        },
        {
          name: '🏆 Hall of Shame',
          value:
            'Responde a un mensaje **mencionando a @Nautilus** para\n' +
            'enviarlo al Hall of Shame. Se genera una imagen del\n' +
            'mensaje y se publica en el canal configurado 🏆🔥💀\n' +
            '`/hos setup` - Configurar canal y rol (Admin)\n' +
            '`/hos config` - Ver configuración actual\n' +
            '`/hos ranking` - Usuarios más nominados\n' +
            '`/hos recent` - Últimas entradas',
          inline: false,
        },
      )
      .setFooter({ text: 'Nautilus v2.0 | Desarrollado con discord.js' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos disponibles'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📚 Comandos de Carlos')
      .setDescription('Bot multimedia con descargas y utilidades')
      .addFields(
        {
          name: '🎵 Sistema de Música (/play)',
          value:
            '`/play play <query>` - Reproduce en voz (YT/Spotify/SC/Deezer)\n' +
            '`/play download <q> [fmt] [src]` - Descarga archivo\n' +
            '`/play skip` / `stop` / `pause` / `resume`\n' +
            '`/play nowplaying` - Canción actual\n' +
            '`/play queue` - Cola de reproducción\n' +
            '`/play volume <1-100>` - Volumen\n' +
            '`/play shuffle` - Modo aleatorio\n' +
            '`/play loop <off/track/queue/autoplay>`\n' +
            '`/play remove <#>` - Quitar canción de la cola\n' +
            '`/play move <desde> <hasta>` - Reordenar\n' +
            '`/play seek <segundos>` - Adelantar/retroceder\n' +
            '`/play lyrics` - Letra de la canción actual\n' +
            '`/play filters <filtro>` - Efectos de audio (20)\n' +
            '`/play clear` - Limpiar la cola',
          inline: false,
        },
        {
          name: '🖼️ Redes Sociales',
          value:
            '`/pinterest <url>` - Descarga de Pinterest\n' +
            '`/instagram <url>` - Descarga de Instagram\n' +
            '`/download <url> [formato]` - Descarga desde enlace directo',
          inline: false,
        },
        {
          name: '🎂 Utilidades',
          value:
            '`/birthday set <DD-MM-YYYY>` - Guarda tu cumpleaños\n' +
            '`/birthday list` - Muestra próximos cumpleaños\n' +
            '`/birthday get` - Muestra tu cumpleaños\n' +
            '`/birthday delete` - Elimina tu cumpleaños\n' +
            '`/invite` - 🔗 Invitar el bot a otros servidores\n' +
            '`/ping` - Muestra la latencia del bot\n' +
            '`/reload [comando]` - 🔄 Recarga comandos sin reiniciar (Owner)',
          inline: false,
        },
        {
          name: '🏆 Hall of Shame',
          value:
            'Responde a un mensaje **mencionando a @Carlos** para\n' +
            'enviarlo al Hall of Shame. Se genera una imagen del\n' +
            'mensaje y se publica en el canal configurado 🏆🔥💀\n' +
            '`/hos setup` - Configurar canal y rol (Admin)\n' +
            '`/hos config` - Ver configuración actual\n' +
            '`/hos ranking` - Usuarios más nominados\n' +
            '`/hos recent` - Últimas entradas',
          inline: false,
        },
      )
      .setFooter({ text: 'Carlos v2.0 | Desarrollado con discord.js' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

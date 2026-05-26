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
          name: '🎵 Música y Video',
          value:
            '`/play <query> [formato] [fuente]` - Descarga de\n' +
            '  YouTube, SoundCloud o Spotify (pega la URL)\n' +
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
            '`/music play <query>` - Reproduce música (YT/Spotify/SC)\n' +
            '`/music skip` / `stop` / `pause` / `resume`\n' +
            '`/music nowplaying` - Canción actual\n' +
            '`/music queue` - Cola de reproducción\n' +
            '`/music volume <1-100>` - Volumen\n' +
            '`/music shuffle` - Modo aleatorio\n' +
            '`/music loop <off/track/queue/autoplay>`\n' +
            '`/music remove <#>` - Quitar canción de la cola\n' +
            '`/music move <desde> <hasta>` - Reordenar\n' +
            '`/music seek <segundos>` - Adelantar/retroceder\n' +
            '`/music lyrics` - Letra de la canción actual\n' +
            '`/music filters <filtro>` - Efectos de audio (18)\n' +
            '`/music clear` - Limpiar la cola',
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

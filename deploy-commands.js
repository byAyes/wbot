require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const logger = require('./utils/logger');

const commands = [
  // --- Play (simple: reproduce música) ---
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎵 Reproduce música en tu canal de voz (YouTube, Spotify, SoundCloud, Deezer)')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL (YouTube/Spotify/SoundCloud/Deezer)')
        .setRequired(true)),

  // --- Music (control + download) ---
  new SlashCommandBuilder()
    .setName('music')
    .setDescription('🎛️ Controla la reproducción, descarga música y administra la cola')
    .addSubcommand(sub =>
      sub.setName('download')
        .setDescription('Descarga audio/video de YouTube, SoundCloud, Spotify o Deezer')
        .addStringOption(option =>
          option.setName('query')
            .setDescription('Nombre de la canción/video o URL')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('formato')
            .setDescription('Formato de descarga (por defecto: audio)')
            .setRequired(false)
            .addChoices(
              { name: 'Audio (MP3)', value: 'audio' },
              { name: 'Video (MP4)', value: 'video' },
            ))
        .addStringOption(option =>
          option.setName('fuente')
            .setDescription('Fuente (se auto-detecta si es URL)')
            .setRequired(false)
            .addChoices(
              { name: 'YouTube', value: 'youtube' },
              { name: 'SoundCloud', value: 'soundcloud' },
            )))
    .addSubcommand(sub =>
      sub.setName('skip')
        .setDescription('⏭️ Salta a la siguiente canción'))
    .addSubcommand(sub =>
      sub.setName('stop')
        .setDescription('🛑 Detiene la música, limpia la cola y sale del canal'))
    .addSubcommand(sub =>
      sub.setName('pause')
        .setDescription('⏸️ Pausa la reproducción actual'))
    .addSubcommand(sub =>
      sub.setName('resume')
        .setDescription('▶️ Reanuda la reproducción pausada'))
    .addSubcommand(sub =>
      sub.setName('nowplaying')
        .setDescription('📌 Muestra la canción que se está reproduciendo'))
    .addSubcommand(sub =>
      sub.setName('queue')
        .setDescription('📋 Muestra la cola de reproducción actual'))
    .addSubcommand(sub =>
      sub.setName('volume')
        .setDescription('🔊 Ajusta el volumen (1-100)')
        .addIntegerOption(option =>
          option.setName('nivel')
            .setDescription('Nivel de volumen (1-100)')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(100)))
    .addSubcommand(sub =>
      sub.setName('shuffle')
        .setDescription('🔀 Activa/desactiva el modo aleatorio'))
    .addSubcommand(sub =>
      sub.setName('loop')
        .setDescription('🔁 Cambia el modo de repetición')
        .addStringOption(option =>
          option.setName('modo')
            .setDescription('Modo de repetición')
            .setRequired(true)
            .addChoices(
              { name: '❌ Desactivado', value: 'off' },
              { name: '🔂 Repetir canción', value: 'track' },
              { name: '🔁 Repetir cola', value: 'queue' },
              { name: '♾️ Autoplay', value: 'autoplay' },
            )))
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('🗑️ Elimina una canción de la cola por su número')
        .addIntegerOption(option =>
          option.setName('numero')
            .setDescription('Número de la canción en la cola')
            .setRequired(true)
            .setMinValue(1)))
    .addSubcommand(sub =>
      sub.setName('move')
        .setDescription('📦 Mueve una canción a otra posición en la cola')
        .addIntegerOption(option =>
          option.setName('desde')
            .setDescription('Número actual de la canción')
            .setRequired(true)
            .setMinValue(1))
        .addIntegerOption(option =>
          option.setName('hasta')
            .setDescription('Nueva posición')
            .setRequired(true)
            .setMinValue(1)))
    .addSubcommand(sub =>
      sub.setName('seek')
        .setDescription('⏩ Adelanta/retrocede a un punto específico de la canción')
        .addIntegerOption(option =>
          option.setName('segundos')
            .setDescription('Posición en segundos')
            .setRequired(true)
            .setMinValue(0)))
    .addSubcommand(sub =>
      sub.setName('lyrics')
        .setDescription('📝 Muestra la letra de la canción actual'))
    .addSubcommand(sub =>
      sub.setName('filters')
        .setDescription('🎛️ Activa o desactiva filtros de audio')
        .addStringOption(option =>
          option.setName('filtro')
            .setDescription('Filtro a aplicar')
            .setRequired(true)
            .addChoices(
              { name: '🎵 Bass Boost (Bajo)', value: 'bassboost_low' },
              { name: '🎵 Bass Boost', value: 'bassboost' },
              { name: '🎵 Bass Boost (Alto)', value: 'bassboost_high' },
              { name: '🌀 8D', value: '8D' },
              { name: '🌊 Vaporwave', value: 'vaporwave' },
              { name: '⚡ Nightcore', value: 'nightcore' },
              { name: '🌐 Phaser', value: 'phaser' },
              { name: '📳 Tremolo', value: 'tremolo' },
              { name: '🎸 Vibrato', value: 'vibrato' },
              { name: '🔙 Reverse', value: 'reverse' },
              { name: '🔊 Treble', value: 'treble' },
              { name: '📈 Normalizer', value: 'normalizer' },
              { name: '🔊 Surround', value: 'surrounding' },
              { name: '🔊 Sub Boost', value: 'subboost' },
              { name: '🎤 Karaoke', value: 'karaoke' },
              { name: '🌀 Flanger', value: 'flanger' },
              { name: '📉 Compresor', value: 'compressor' },
              { name: '☕ Lo-Fi', value: 'lofi' },
              { name: '💥 Earrape', value: 'earrape' },
              { name: '🎛️ Mono', value: 'mono' },
            )))
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('🗑️ Limpia toda la cola de reproducción')),

  // --- Spotify ---
  new SlashCommandBuilder()
    .setName('spotify')
    .setDescription('Busca información de canciones en Spotify y descárgalas')
    .addStringOption(option =>
      option.setName('query')
        .setDescription('Nombre de la canción o URL de Spotify')
        .setRequired(true)),

  // --- Pinterest ---
  new SlashCommandBuilder()
    .setName('pinterest')
    .setDescription('Descarga imágenes/videos de Pinterest')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL del contenido de Pinterest')
        .setRequired(true)),

  // --- Instagram ---
  new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Descarga videos/reels de Instagram')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL del contenido de Instagram')
        .setRequired(true)),

  // --- Download (general) ---
  new SlashCommandBuilder()
    .setName('download')
    .setDescription('Descarga contenido multimedia desde cualquier enlace directo')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('URL directa del archivo multimedia')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('formato')
        .setDescription('Formato de descarga')
        .setRequired(false)
        .addChoices(
          { name: 'Audio (MP3)', value: 'audio' },
          { name: 'Video (MP4)', value: 'video' },
        )),

  // --- Birthday ---
  new SlashCommandBuilder()
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



  // --- Hall of Shame ---
  new SlashCommandBuilder()
    .setName('hos')
    .setDescription('🏆 Sistema del Hall of Shame')
    .addSubcommand(sub =>
      sub.setName('setup')
        .setDescription('Configura el Hall of Shame (Admin)')
        .addChannelOption(option =>
          option.setName('channel')
            .setDescription('Canal donde se publicarán las entradas')
            .setRequired(false))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Rol a pinguear cuando haya nueva entrada')
            .setRequired(false))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Activar o desactivar el Hall of Shame')
            .setRequired(false)))
    .addSubcommand(sub =>
      sub.setName('config')
        .setDescription('Muestra la configuración actual del Hall of Shame'))
    .addSubcommand(sub =>
      sub.setName('ranking')
        .setDescription('Usuarios más nominados al Hall of Shame'))
    .addSubcommand(sub =>
      sub.setName('recent')
        .setDescription('Últimas entradas en el Hall of Shame')),

  // --- Invite ---
  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('🔗 Envía el enlace de invitación para agregar el bot a otros servidores'),

  // --- Utility ---
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Muestra la latencia del bot'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Muestra la lista de comandos disponibles'),

  // --- Reload ---
  new SlashCommandBuilder()
    .setName('reload')
    .setDescription('🔄 Recarga todos los comandos sin reiniciar el bot (Solo owner)')
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Comando específico a recargar')
        .setRequired(false)),
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.divider();
    logger.startup('REGISTRO DE COMANDOS');
    logger.info('Limpiando comandos globales anteriores...');

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    logger.info('Comandos anteriores eliminados.');

    logger.info(`Registrando ${commands.length} comandos slash...`);

    const data = await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands.map(cmd => cmd.toJSON()) },
    );

    logger.success(`¡${data.length} comandos registrados exitosamente!`);
    data.forEach(cmd => {
      logger.info(`  /${cmd.name} - ${cmd.description}`);
    });
    logger.divider();
  } catch (error) {
    logger.error('Error al registrar comandos:', error);
    process.exit(1);
  }
})();

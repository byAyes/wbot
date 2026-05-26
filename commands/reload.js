const { SlashCommandBuilder, PermissionFlagsBits, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('🔄 Recarga todos los comandos sin reiniciar el bot (Solo owner)')
    .addStringOption(option =>
      option.setName('target')
        .setDescription('Comando específico a recargar (dejar vacío para recargar todos)')
        .setRequired(false)),

  async execute(interaction) {
    // Owner-only check
    const ownerId = process.env.BOT_OWNER_ID;
    if (!ownerId) {
      return interaction.reply({
        content: '❌ `BOT_OWNER_ID` no está configurado en el archivo `.env` del servidor.',
        ephemeral: true,
      });
    }
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: '❌ Este comando solo puede ser usado por el dueño del bot.',
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getString('target');
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    const results = { reloaded: [], failed: [], skipped: [] };

    if (target) {
      // Reload a single command
      const fileName = commandFiles.find(f => f.replace('.js', '') === target);

      if (!fileName) {
        return interaction.followUp({
          content: `❌ No se encontró el comando \`/${target}\`. Comandos disponibles: \`${commandFiles.map(f => f.replace('.js', '')).join('`, `')}\``,
          ephemeral: true,
        });
      }

      const filePath = path.join(commandsPath, fileName);
      const result = reloadCommandFile(filePath, fileName, interaction.client);
      if (result.success) {
        results.reloaded.push(`/${target}`);
      } else {
        results.failed.push(`/${target}: ${result.error}`);
      }
    } else {
      // Reload all commands
      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const commandName = file.replace('.js', '');

        // Skip reload.js itself during a full reload (we're executing it)
        if (commandName === 'reload') {
          results.skipped.push('/reload (en ejecución)');
          continue;
        }

        const result = reloadCommandFile(filePath, file, interaction.client);
        if (result.success) {
          results.reloaded.push(`/${commandName}`);
        } else {
          results.failed.push(`/${commandName}: ${result.error}`);
        }
      }
    }

    // Re-register commands with Discord API
    try {
      await registerCommandsWithDiscord(interaction.client);
    } catch (error) {
      results.failed.push(`Registro API: ${error.message}`);
    }

    // Build response
    const lines = [];
    lines.push('🔄 **Recarga de comandos completada**\n');

    if (results.reloaded.length > 0) {
      lines.push(`✅ **Recargados (${results.reloaded.length}):**`);
      lines.push(results.reloaded.join(', '));
      lines.push('');
    }

    if (results.skipped.length > 0) {
      lines.push(`⏭️ **Omitidos (${results.skipped.length}):**`);
      lines.push(results.skipped.join(', '));
      lines.push('');
    }

    if (results.failed.length > 0) {
      lines.push(`❌ **Fallos (${results.failed.length}):**`);
      results.failed.forEach(f => lines.push(`• ${f}`));
      lines.push('');
    }

    lines.push(`📦 Caché de Node: ${Object.keys(require.cache).length} módulos cargados`);
    lines.push(`📋 Comandos en memoria: ${interaction.client.commands.size}`);

    return interaction.followUp({ content: lines.join('\n'), ephemeral: true });
  },
};

/**
 * Reload a single command file from cache and re-register it
 */
function reloadCommandFile(filePath, fileName, client) {
  const commandName = fileName.replace('.js', '');

  try {
    // Delete from require cache
    delete require.cache[require.resolve(filePath)];

    // Re-require the command
    const command = require(filePath);

    // Validate structure
    if (!('data' in command) || !('execute' in command)) {
      throw new Error(`El archivo ${fileName} no tiene "data" o "execute"`);
    }

    // Register in collection
    client.commands.set(command.data.name, command);
    logger.success(`Comando recargado: /${command.data.name}`);

    return { success: true };
  } catch (error) {
    logger.error(`Error al recargar /${commandName}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Re-register all commands with Discord API.
 * Uses client.commands collection (already reloaded in memory)
 * instead of re-reading from disk.
 */
async function registerCommandsWithDiscord(client) {
  const commands = [...client.commands.values()]
    .filter(cmd => 'data' in cmd)
    .map(cmd => cmd.data.toJSON());

  if (commands.length === 0) {
    throw new Error('No hay comandos en la colección para registrar');
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  logger.info(`Re-registrando ${commands.length} comandos con Discord API...`);

  const data = await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands },
  );

  logger.success(`${data.length} comandos registrados en Discord API`);
}

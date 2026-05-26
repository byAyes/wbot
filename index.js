require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { initPlayer } = require('./music/player');

// --- Client Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.commands = new Collection();

// --- Load Commands ---
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    logger.info(`Loaded command: /${command.data.name}`);
  } else {
    logger.warn(`Command ${file} is missing required "data" or "execute" property.`);
  }
}

// --- Load Events ---
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    logger.info(`Loaded event: ${event.name}`);
  }
}

// --- Ready Event ---
client.once(Events.ClientReady, async (c) => {
  logger.divider();
  logger.startup('NAUTILUS DISCORD BOT');
  logger.success(`Conectado como: ${c.user.tag}`);
  logger.info(`Servidores: ${c.guilds.cache.size}`);
  logger.info(`Comandos: ${client.commands.size}`);

  // Initialize music player
  try {
    await initPlayer(client);
    logger.success('Sistema de música inicializado correctamente');
  } catch (error) {
    logger.error('Error al inicializar sistema de música:', error.message);
  }

  logger.divider();
});

// --- Interaction Create Event ---
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    logger.command(
      interaction.commandName,
      interaction.user.id,
      interaction.user.tag,
    );
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Error executing /${interaction.commandName}:`, error);

    const reply = { content: '❌ Ocurrió un error al ejecutar el comando. Por favor, inténtalo de nuevo.', ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// --- Error Handling ---
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
});

// --- Login ---
const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error('DISCORD_TOKEN no está configurado en el archivo .env');
  process.exit(1);
}

client.login(token);

module.exports = client;

require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Events, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');
const { initPlayer, waitForNodesOnline } = require('./music/player');
const ReminderService = require('./services/reminderService');
const AIService = require('./services/aiService');
const IntentClassifier = require('./services/intentClassifier');
const KnowledgeBase = require('./services/knowledgeBase');
const { getLimiter, formatRateLimitMessage } = require('./utils/rateLimiter');

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

// --- Global Services ---
const reminderService = new ReminderService();
const aiService = new AIService();
const intentClassifier = new IntentClassifier();
const knowledgeBase = new KnowledgeBase();

// Set reminder service reference on reminder command
const reminderCommand = require('./commands/reminder');
if (reminderCommand.setReminderService) {
  reminderCommand.setReminderService(reminderService);
}

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

  // Start reminder service
  reminderService.start();
  reminderService.onReminder = async (reminder) => {
    try {
      const channel = await client.channels.fetch(reminder.channel_id);
      if (channel && channel.isTextBased()) {
        await channel.send({
          content: `⏰ <@${reminder.user_id}> Recordatorio: **${reminder.message}**`,
        });
      }
      logger.info(`Recordatorio enviado: ${reminder.id}`);
    } catch (error) {
      logger.error('Error enviando recordatorio:', error.message);
    }
  };

  // Log AI status
  if (aiService.isConfigured()) {
    logger.success(`IA configurada: ${aiService.provider} (${aiService._getModel()})`);
  } else {
    logger.warn('IA no configurada. Añade OPENAI_API_KEY, GROQ_API_KEY o ANTHROPIC_API_KEY en .env');
  }

  try {
    await initPlayer(client);
    await waitForNodesOnline();
    logger.success('Sistema de música conectado correctamente');
  } catch (error) {
    logger.error('Error al conectar sistema de música:', error.message);
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

    const reply = { content: '❌ Ocurrió un error al ejecutar el comando. Por favor, inténtalo de nuevo.', flags: MessageFlags.Ephemeral };

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

// --- Graceful shutdown ---
process.on('SIGINT', () => {
  logger.info('Cerrando el bot gracefulmente...');
  reminderService.stop();
  process.exit(0);
});

// --- Login ---
const token = process.env.DISCORD_TOKEN;
if (!token) {
  logger.error('DISCORD_TOKEN no está configurado en el archivo .env');
  process.exit(1);
}

async function bootstrap() {
  await client.login(token);
}

bootstrap().catch((error) => {
  logger.error('Error fatal al iniciar el bot:', error);
  process.exit(1);
});

module.exports = client;

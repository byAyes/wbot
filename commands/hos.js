const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getHallOfShameStats,
  getRecentHallOfShame,
  getGuildConfig,
  setHosChannel,
  setHosRole,
  setHosEnabled,
} = require('../database/setup');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
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
            .setDescription('Rol a pinguear cuando haya nueva entrada (opcional)')
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

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'setup') {
      // Require Manage Channels permission
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({
          content: '❌ Necesitas el permiso **Gestionar Canales** para configurar el Hall of Shame.',
          ephemeral: true,
        });
      }

      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('role');
      const enabled = interaction.options.getBoolean('enabled');

      if (!channel && !role && enabled === null) {
        return interaction.reply({
          content: '❌ Debes especificar al menos una opción: `channel`, `role` o `enabled`.\n\nEjemplo:\n`/hos setup channel:#hall-of-shame role:@Mencionado`',
          ephemeral: true,
        });
      }

      let response = '✅ Hall of Shame configurado:\n';

      if (channel) {
        setHosChannel(guildId, channel.id);
        response += `• Canal: <#${channel.id}>\n`;
        logger.info(`HOS channel set to ${channel.id} in guild ${guildId}`);
      }

      if (role) {
        setHosRole(guildId, role.id);
        response += `• Rol notificado: ${role.toString()}\n`;
        logger.info(`HOS role set to ${role.id} in guild ${guildId}`);
      }

      if (enabled !== null) {
        setHosEnabled(guildId, enabled);
        response += `• Estado: ${enabled ? '✅ Activado' : '❌ Desactivado'}\n`;
        logger.info(`HOS toggled to ${enabled} in guild ${guildId}`);
      }

      return interaction.reply({ content: response, ephemeral: true });
    }

    if (subcommand === 'config') {
      const config = getGuildConfig(guildId);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🏆 Hall of Shame — Configuración')
        .addFields(
          {
            name: 'Estado',
            value: config.hos_enabled ? '✅ Activado' : '❌ Desactivado',
            inline: true,
          },
          {
            name: 'Canal',
            value: config.hos_channel_id ? `<#${config.hos_channel_id}>` : '❌ No configurado',
            inline: true,
          },
          {
            name: 'Rol notificado',
            value: config.hos_role_id ? `<@&${config.hos_role_id}>` : 'No configurado',
            inline: true,
          },
        )
        .setFooter({ text: 'Usa /hos setup para cambiar la configuración' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'ranking') {
      const stats = getHallOfShameStats(guildId, 15);

      if (!stats || stats.length === 0) {
        return interaction.reply({
          content: '🏆 El Hall of Shame está vacío... ¡sé el primero en nominar a alguien!\n\nResponde a un mensaje y menciona a **@Carlos** para hacerlo.',
          ephemeral: true,
        });
      }

      const medals = ['🥇', '🥈', '🥉'];
      const list = stats.map((entry, index) => {
        const medal = index < 3 ? medals[index] : `${index + 1}.`;
        return `${medal} **${entry.quoted_username}** — ${entry.count} ${entry.count === 1 ? 'nominación' : 'nominaciones'}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🏆 Hall of Shame — Ranking')
        .setDescription(list)
        .setFooter({ text: `Total: ${stats.reduce((a, b) => a + b.count, 0)} entradas` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'recent') {
      const entries = getRecentHallOfShame(guildId, 10);

      if (!entries || entries.length === 0) {
        return interaction.reply({
          content: '🏆 El Hall of Shame está vacío... ¡sé el primero en nominar a alguien!\n\nResponde a un mensaje y menciona a **@Carlos** para hacerlo.',
          ephemeral: true,
        });
      }

      const list = entries.map((entry, index) => {
        const date = new Date(entry.posted_at);
        const dateStr = date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const contentPreview = entry.quoted_content
          ? entry.quoted_content.length > 60
            ? `"${entry.quoted_content.slice(0, 60)}..."`
            : `"${entry.quoted_content}"`
          : '*[sin texto]*';
        return `**${index + 1}.** ${entry.quoted_username} — ${contentPreview}\n└ ${dateStr} • [Ver mensaje](${entry.quoted_message_url})`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🏆 Hall of Shame — Recientes')
        .setDescription(list)
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },
};

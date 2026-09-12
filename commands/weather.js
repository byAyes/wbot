/**
 * /weather - Get weather for a city (uses wttr.in free API)
 */
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('🌤️ Consulta el clima de una ciudad')
    .addStringOption(option =>
      option.setName('ciudad')
        .setDescription('Nombre de la ciudad (ej: Madrid, Nueva York)')
        .setRequired(true)
        .setMaxLength(100)),

  async execute(interaction) {
    const city = interaction.options.getString('ciudad');
    await interaction.deferReply();

    try {
      const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      const data = response.data;
      const current = data.current_condition[0];
      const location = data.nearest_area[0];

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🌤️ Clima en ${location.areaName[0].value}, ${location.country[0].value}`)
        .addFields(
          { name: '🌡️ Temperatura', value: `${current.temp_C}°C (${current.temp_F}°F)`, inline: true },
          { name: '💨 Viento', value: `${current.windspeedKmph} km/h`, inline: true },
          { name: '💧 Humedad', value: `${current.humidity}%`, inline: true },
          { name: '☁️ Condiciones', value: current.weatherDesc[0].value, inline: true },
          { name: '🌧️ Lluvia', value: `${current.precipMM} mm`, inline: true },
          { name: '👁️ Visibilidad', value: `${current.visibility} km`, inline: true },
        )
        .setFooter({ text: 'Fuente: wttr.in' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply({ content: `❌ No pude obtener el clima para "${city}".` });
    }
  },
};
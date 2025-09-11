require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { manejarSpotify } = require('./multimedia/spotifyHandler');
const { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI } = require('./multimedia/youtube.js');
const { descargarPinterest } = require('./multimedia/pinterest.js');
const puppeteer = require('puppeteer');

const app = express();
app.use(bodyParser.json());

// --- Configuración del Bot ---
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || 'TU_TOKEN_DE_ACCESO';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'TU_TOKEN_DE_VERIFICACION';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || 'ID_DE_TU_NUMERO_DE_TELEFONO';

// Inicializar el cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'wbot-session'
    })
});

client.on('qr', (qr) => {
    console.log('Escanea este código QR con tu aplicación de WhatsApp:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('El cliente está listo para usar.');
});

client.on('auth_failure', (msg) => {
    console.error('Error de autenticación:', msg);
});

// Manejar mensajes entrantes
client.on('message', async (message) => {
    const body = message.body;
    const bodyLower = body.toLowerCase().trim();

    const isPlayCommand = bodyLower.startsWith('.p ') || bodyLower.startsWith('.play ') || bodyLower.startsWith('.d ') || bodyLower.startsWith('.descargar ');

    if (isPlayCommand) {
        const command = body.split(' ')[0];
        const content = body.substring(command.length).trim();

        if (!content) {
            return message.reply('Por favor, proporciona un término de búsqueda o una URL.');
        }

        // Derivar a la función correcta según el contenido
        if (content.includes('pinterest.com')) {
            await descargarPinterest(content, message);
        } else {
            await manejarBusquedaYouTube(content, message, client);
        }

    } else if ((bodyLower === 'si' || bodyLower === 'sí') && message.hasQuotedMsg) {
        const quotedMsg = await message.getQuotedMessage();
        if (quotedMsg.fromMe && quotedMsg.body.includes('¿Quieres descargar la canción?')) {
            message.react('⌛');
            const quotedBody = quotedMsg.body;

            const titleMatch = quotedBody.match(/🎵 \*Título:\* (.*)/);
            const artistMatch = quotedBody.match(/🎤 \*Artista:\* (.*)/);

            if (titleMatch && artistMatch) {
                const title = titleMatch[1].trim();
                const artist = artistMatch[1].trim();
                const searchTerm = `${title} ${artist}`;

                const statusMsg = await message.reply(`Buscando "${searchTerm}" en YouTube...`);
                
                const videoResult = await buscarPrimerVideoAPI(searchTerm);

                if (videoResult && videoResult.url) {
                    await descargarAudioAPI(videoResult.url, statusMsg);
                } else {
                    await statusMsg.edit(`No se encontraron resultados para "${searchTerm}" en YouTube.`);
                    message.react('❌');
                }
            } else {
                message.reply('No pude encontrar el título y artista en el mensaje original.');
                message.react('❌');
            }
        }
    } else if (bodyLower.startsWith('.spotify') || bodyLower.startsWith('.s') || bodyLower.startsWith('.sp')) {
        const command = body.split(' ')[0];
        const query = body.substring(command.length).trim();
        await manejarSpotify(query, message);
    }
});

// Iniciar el cliente
client.initialize();

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
    if (WHATSAPP_TOKEN === 'TU_TOKEN_DE_ACCESO' || VERIFY_TOKEN === 'TU_TOKEN_DE_VERIFICACION') {
        console.warn('ADVERTENCIA: Aún no has configurado tus tokens de WhatsApp en el archivo index.js.');
    }
});

// Configuración global para Puppeteer
(async () => {
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
})();

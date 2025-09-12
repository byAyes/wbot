require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { manejarSpotify } = require('./multimedia/spotifyHandler');
const { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI } = require('./multimedia/youtube.js');
const { descargarPinterest } = require('./multimedia/pinterest.js');
const { guardarCumpleaños, mostrarCumpleaños } = require('./bot/cumpleaños.js');
const { spawn } = require('child_process');

const app = express();
app.use(bodyParser.json());

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if(qr) {
            qrcode.generate(qr, {small: true});
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('opened connection');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message) return;

        const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const bodyLower = body.toLowerCase().trim();

        const isPlayCommand = bodyLower.startsWith('.p ') || bodyLower.startsWith('.play ') || bodyLower.startsWith('.d ') || bodyLower.startsWith('.descargar ');

        if (isPlayCommand) {
            const command = body.split(' ')[0];
            const content = body.substring(command.length).trim();

            if (!content) {
                return sock.sendMessage(msg.key.remoteJid, { text: 'Por favor, proporciona un término de búsqueda o una URL.' }, { quoted: msg });
            }

            if (content.includes('pinterest.com')) {
                await descargarPinterest(content, msg, sock);
            } else {
                await manejarBusquedaYouTube(content, msg, sock);
            }
        } else if ((bodyLower === 'si' || bodyLower === 'sí') && msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedBody = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';

            if (quotedBody.includes('¿Quieres descargar la canción?')) {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '⌛', key: msg.key } });
                const titleMatch = quotedBody.match(/🎵 *Título: * (.*)/);
                const artistMatch = quotedBody.match(/🎤 *Artista: * (.*)/);

                if (titleMatch && artistMatch) {
                    const title = titleMatch[1].trim();
                    const artist = artistMatch[1].trim();
                    const searchTerm = `${title} ${artist}`;

                    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: `Buscando "${searchTerm}" en YouTube...` }, { quoted: msg });

                    const videoResult = await buscarPrimerVideoAPI(searchTerm);

                    if (videoResult && videoResult.url) {
                        await descargarAudioAPI(videoResult.url, statusMsg, sock);
                    } else {
                        await sock.sendMessage(msg.key.remoteJid, { text: `No se encontraron resultados para "${searchTerm}" en YouTube.` }, { quoted: msg });
                        await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
                    }
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: 'No pude encontrar el título y artista en el mensaje original.' }, { quoted: msg });
                    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
                }
            }
        } else if (bodyLower.startsWith('.spotify') || bodyLower.startsWith('.s') || bodyLower.startsWith('.sp')) {
            const command = body.split(' ')[0];
            const query = body.substring(command.length).trim();
            await manejarSpotify(query, msg, sock);
        } else if (bodyLower.startsWith('.bd')) {
            await guardarCumpleaños(msg, sock);
        } else if (bodyLower === '.cumpleaños') {
            await mostrarCumpleaños(msg, sock);
        } else if (bodyLower === '.reset') {
            console.log('Reiniciando el bot...');
            await sock.sendMessage(msg.key.remoteJid, { text: 'Reiniciando...' });
            const child = spawn(process.argv[0], process.argv.slice(1), {
                detached: true,
                stdio: 'inherit'
            });
            child.unref();
            process.exit();
        }
    });
}

connectToWhatsApp();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🟢 Servidor escuchando en el puerto ${PORT} 🟢`);
});

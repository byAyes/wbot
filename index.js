require('dotenv').config();


const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { manejarSpotify, descargarSpotifyDirecto } = require('./multimedia/spotifyHandler');
const { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI } = require('./multimedia/youtube.js');
const { descargarMultimedia } = require('./multimedia/descargar.js');
const { guardarCumpleaños, mostrarCumpleaños } = require('./bot/cumpleaños.js');
const { spawn } = require('child_process');

const app = express();
app.use(bodyParser.json());

async function connectToWhatsApp() {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = await import('@whiskeysockets/baileys');
    const { Boom } = await import('@hapi/boom');
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

            await descargarMultimedia(content, 'video', msg, sock);
        } else if ((bodyLower === 'si' || bodyLower === 'sí') && msg.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedBody = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text || '';

            if (quotedBody.includes('¿Quieres descargar la canción?')) {
                await sock.sendMessage(msg.key.remoteJid, { react: { text: '⌛', key: msg.key } });
                const spotifyUrlMatch = quotedBody.match(/(https:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+)/);

                if (spotifyUrlMatch && spotifyUrlMatch[1]) {
                    const spotifyUrl = spotifyUrlMatch[1];
                    console.log('DEBUG: Extracted Spotify URL:', spotifyUrl);
                    await descargarSpotifyDirecto(spotifyUrl, msg, sock);
                } else {
                    await sock.sendMessage(msg.key.remoteJid, { text: 'No pude encontrar el enlace de Spotify en el mensaje original.' }, { quoted: msg });
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

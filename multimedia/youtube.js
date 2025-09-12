const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

// --- Funciones Auxiliares ---

async function buscarPrimerVideoAPI(searchTerm) {
    try {
        const searchResponse = await fetch(`${process.env.API_URL}/search/yt?query=${encodeURIComponent(searchTerm)}&apikey=${process.env.API_KEY}`);
        const searchResult = await response.json();
        if (searchResult.status && searchResult.result?.length) {
            return searchResult.result[0];
        }
        return null;
    } catch (error) {
        console.error('Error al buscar en la API de YT:', error.message);
        return null;
    }
}

// --- Manejador de Comandos ---

async function manejarBusquedaYouTube(searchTerm, msg, sock) {
    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: `Buscando "${searchTerm}" en YouTube...` }, { quoted: msg });
    try {
        const firstResult = await buscarPrimerVideoAPI(searchTerm);

        if (!firstResult) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No se encontraron resultados para tu búsqueda.' }, { quoted: msg });
        }

        const { title, autor, duration, url } = firstResult;
        const confirmationText = `Encontré esto:\n\n🎵 *Título:* ${title}\n👤 *Autor:* ${autor}\n⏳ *Duración:* ${duration}\n\n¿Descargar como audio o video? Responde "audio" o "video".`;
        await sock.sendMessage(msg.key.remoteJid, { text: confirmationText }, { quoted: msg });

        // Baileys doesn't have a concept of a message listener like wweb.js
        // The logic for handling the "audio" or "video" response is now in index.js
        // This function is now responsible for just the search and confirmation

    } catch (error) {
        console.error('Error en manejarBusquedaYouTube:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al procesar tu búsqueda.' }, { quoted: msg });
    }
}

// --- Funciones de Descarga ---

async function descargarAudioAPI(url, statusMsg, sock) {
    try {
        await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de audio de la API' }, { quoted: statusMsg });
        const response = await fetch(`${process.env.API_URL}/dow/ytmp3v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`);
        const result = await response.json();

        if (!result.status || !result.data?.dl) {
            return await sock.sendMessage(statusMsg.key.remoteJid, { text: '🐼 Error al obtener el audio desde la API.' }, { quoted: statusMsg });
        }

        const { dl, title } = result.data;
        await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando audio: *${title}*` }, { quoted: statusMsg });

        await sock.sendMessage(statusMsg.key.remoteJid, { audio: { url: dl }, mimetype: 'audio/mpeg' }, { quoted: statusMsg });
        await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Audio enviado' }, { quoted: statusMsg });

    } catch (error) {
        console.error('Error en descarga de audio (API):', error);
        await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Hubo un error al descargar el audio.' }, { quoted: statusMsg });
    }
}

async function descargarVideoAPI(url, statusMsg, sock) {
    try {
        await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de video de la API' }, { quoted: statusMsg });
        const apiResponse = await fetch(`${process.env.API_URL}/dow/ytmp4v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`);
        const result = await apiResponse.json();

        if (!result.status || !result.data?.dl) {
            return await sock.sendMessage(statusMsg.key.remoteJid, { text: '🐼 Error al obtener el video desde la API.' }, { quoted: statusMsg });
        }

        const { dl, title } = result.data;

        await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Comprobando tamaño del video...' }, { quoted: statusMsg });
        const headResponse = await fetch(dl, { method: 'HEAD' });
        const contentLength = headResponse.headers.get('Content-Length');
        const fileSizeMB = parseInt(contentLength || '0', 10) / (1024 * 1024);

        const limit = 15; // Límite de 15 MB
        const asDocument = fileSizeMB >= limit;

        if (asDocument) {
            await sock.sendMessage(statusMsg.key.remoteJid, { text: `El video pesa ${fileSizeMB.toFixed(2)} MB. Se enviará como documento.` }, { quoted: statusMsg });
        }

        await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando video: *${title}*` }, { quoted: statusMsg });

        await sock.sendMessage(statusMsg.key.remoteJid, { video: { url: dl }, caption: title }, { quoted: statusMsg });
        await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Video enviado' }, { quoted: statusMsg });

    } catch (error) {
        console.error('Error en descarga de video (API):', error);
        await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Hubo un error al descargar el video.' }, { quoted: statusMsg });
    }
}

module.exports = { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI, descargarVideoAPI };
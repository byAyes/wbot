const { MessageMedia } = require('whatsapp-web.js');

// --- Funciones Auxiliares ---

const animateMessage = (message, text) => {
    let dots = 0;
    const interval = setInterval(() => {
        dots = (dots + 1) % 4;
        const dotString = '.'.repeat(dots);
        message.edit(text + dotString).catch(() => clearInterval(interval));
    }, 800);
    return interval;
};

async function buscarPrimerVideoAPI(searchTerm) {
    try {
        const searchResponse = await fetch(`${process.env.API_URL}/search/yt?query=${encodeURIComponent(searchTerm)}&apikey=${process.env.API_KEY}`);
        const searchResult = await searchResponse.json();
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

async function manejarBusquedaYouTube(searchTerm, message, client) {
    const statusMsg = await message.reply(`Buscando "${searchTerm}" en YouTube...`);
    try {
        const firstResult = await buscarPrimerVideoAPI(searchTerm);

        if (!firstResult) {
            return await statusMsg.edit('❌ No se encontraron resultados para tu búsqueda.');
        }

        const { title, autor, duration, url } = firstResult;
        const confirmationText = `Encontré esto:

🎵 *Título:* ${title}
👤 *Autor:* ${autor}
⏳ *Duración:* ${duration}

¿Descargar como audio o video? Responde "audio" o "video".`;
        await statusMsg.edit(confirmationText);

        const listener = async (reply) => {
            if (reply.from === message.from) {
                const choice = reply.body.toLowerCase().trim();
                if (choice === 'audio' || choice === 'video') {
                    client.removeListener('message', listener);
                    if (choice === 'audio') {
                        await descargarAudioAPI(url, statusMsg);
                    } else {
                        await descargarVideoAPI(url, statusMsg);
                    }
                }
            }
        };

        client.on('message', listener);

        setTimeout(() => {
            const stillListening = client.listeners('message').some(l => l.toString() === listener.toString());
            if (stillListening) {
                client.removeListener('message', listener);
                statusMsg.edit('⏰ Tiempo de espera agotado.');
            }
        }, 30000);

    } catch (error) {
        console.error('Error en manejarBusquedaYouTube:', error.message);
        await statusMsg.edit('Hubo un error al procesar tu búsqueda.');
    }
}

// --- Funciones de Descarga ---

async function descargarAudioAPI(url, statusMsg) {
    let animationInterval;
    try {
        const initialText = 'Obteniendo enlace de audio de la API';
        animationInterval = animateMessage(statusMsg, initialText);
        const response = await fetch(`${process.env.API_URL}/dow/ytmp3v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`);
        const result = await response.json();
        clearInterval(animationInterval);

        if (!result.status || !result.data?.dl) {
            return await statusMsg.edit('🐼 Error al obtener el audio desde la API.');
        }

        const { dl, title } = result.data;
        const downloadText = `Descargando audio: *${title}*`;
        animationInterval = animateMessage(statusMsg, downloadText);

        const media = await MessageMedia.fromUrl(dl, { unsafeMime: true });
        clearInterval(animationInterval);
        media.mimetype = 'audio/mpeg';
        
        const chat = await statusMsg.getChat();
        await chat.sendMessage(media, { sendAudioAsVoice: false });
        await statusMsg.edit('✅ Audio enviado');

    } catch (error) {
        if (animationInterval) clearInterval(animationInterval);
        console.error('Error en descarga de audio (API):', error);
        await statusMsg.edit('Hubo un error al descargar el audio.');
    }
}

async function descargarVideoAPI(url, statusMsg) {
    let animationInterval;
    try {
        const initialText = 'Obteniendo enlace de video de la API';
        animationInterval = animateMessage(statusMsg, initialText);
        const apiResponse = await fetch(`${process.env.API_URL}/dow/ytmp4v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`);
        const result = await apiResponse.json();
        clearInterval(animationInterval);

        if (!result.status || !result.data?.dl) {
            return await statusMsg.edit('🐼 Error al obtener el video desde la API.');
        }

        const { dl, title } = result.data;

        await statusMsg.edit('Comprobando tamaño del video...');
        const headResponse = await fetch(dl, { method: 'HEAD' });
        const contentLength = headResponse.headers.get('Content-Length');
        const fileSizeMB = parseInt(contentLength || '0', 10) / (1024 * 1024);

        const limit = 15; // Límite de 15 MB
        const asDocument = fileSizeMB >= limit;

        if (asDocument) {
            await statusMsg.edit(`El video pesa ${fileSizeMB.toFixed(2)} MB. Se enviará como documento.`);
        }

        const downloadText = `Descargando video: *${title}*`;
        animationInterval = animateMessage(statusMsg, downloadText);

        const media = await MessageMedia.fromUrl(dl, { unsafeMime: true });
        clearInterval(animationInterval);
        
        const chat = await statusMsg.getChat();
        const options = { caption: title };
        if (asDocument) {
            options.sendMediaAsDocument = true;
        }
        
        await chat.sendMessage(media, options);
        await statusMsg.edit('✅ Video enviado');

    } catch (error) {
        if (animationInterval) clearInterval(animationInterval);
        console.error('Error en descarga de video (API):', error);
        await statusMsg.edit('Hubo un error al descargar el video.');
    }
}

module.exports = { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI, descargarVideoAPI };

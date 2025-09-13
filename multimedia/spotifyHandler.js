const axios = require('axios');

/**
 * Maneja la búsqueda de canciones desde Spotify.
 * @param {string} query - Término de búsqueda proporcionado por el usuario.
 * @param {object} msg - Mensaje original para responder con la información.
 * @param {object} sock - Instancia del socket de Baileys.
 */
async function manejarSpotify(query, msg, sock) {
    if (!query) {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Por favor, proporciona el nombre de la canción o artista que deseas buscar.' }, { quoted: msg });
        return;
    }

    try {
        await sock.readMessages([msg.key]);
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '⌛', key: msg.key } });

        // Buscar información de la canción
        const busqueda = await buscarSpotify(query);
        if (!busqueda.length) {
            throw new Error('No se encontró la canción.');
        }

        const cancion = busqueda[0];

        // Enviar información detallada al usuario con la opción de descarga
        const info = `🎵 *Título:* ${cancion.title}\n🎤 *Artista:* ${cancion.artist}\n💺 *Álbum:* ${cancion.album}\n⏳ *Duración:* ${cancion.duration}\n🔗 *Enlace:* ${cancion.url}\n\n¿Quieres descargar la canción? Escribe 'si'`;

        await sock.sendMessage(msg.key.remoteJid, { text: info }, { quoted: msg });

        await sock.sendMessage(msg.key.remoteJid, { react: { text: '✅', key: msg.key } });
    } catch (error) {
        console.error('Error al procesar la solicitud de Spotify:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Ocurrió un error al procesar tu solicitud.' }, { quoted: msg });
    }
}

/**
 * Busca canciones en Spotify usando una API externa.
 * @param {string} query - Término de búsqueda.
 * @returns {Promise<Array>} - Devuelve una lista de canciones encontradas.
 */
async function buscarSpotify(query) {
    try {
        const formattedQuery = encodeURIComponent(query).replace(/%20/g, '+');
        const apiUrl = `${process.env.API_URL}/search/spotify?query=${formattedQuery}&apikey=${process.env.API_KEY}`;
        console.log('Spotify API URL:', apiUrl);
        const res = await axios.get(apiUrl);
        console.log('Spotify API Response Status:', res.status);
        console.log('Spotify API Response Data:', res.data);

        if (!res.data?.status || !res.data?.data?.length) {
            return [];
        }

        const primeraCancion = res.data.data[0];

        return [
            {
                title: primeraCancion.title,
                artist: primeraCancion.artist,
                album: primeraCancion.album,
                duration: primeraCancion.duration,
                url: primeraCancion.url,
                image: primeraCancion.image || ''
            }
        ];
    } catch (error) {
        console.error('Error en la búsqueda de Spotify. Status:', error.response?.status, error.message);
        if (axios.isAxiosError(error) && error.response) {
            console.error('Spotify API Error Response Data:', error.response.data);
        }
        throw new Error('Fallo en la búsqueda de Spotify.');
    }
}

/**
 * Descarga una canción de Spotify directamente usando una API externa.
 * @param {string} spotifyUrl - URL de la canción de Spotify.
 * @param {object} msg - Mensaje original para responder.
 * @param {object} sock - Instancia del socket de Baileys.
 * @param {number} retries - Número de reintentos en caso de fallo.
 */
async function descargarSpotifyDirecto(spotifyUrl, msg, sock, retries = 3) {
    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: 'Obteniendo enlace de descarga de Spotify...' }, { quoted: msg });

    for (let i = 0; i < retries; i++) {
        try {
            const apiUrl = `${process.env.ALTERNATIVE_API_URL}/api/d/spotifyv2?url=${encodeURIComponent(spotifyUrl)}`;
            console.log('Spotify Download API URL:', apiUrl);
            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = response.data;

            if (!result.status || !result.data?.mp3DownloadLink) {
                console.error('API de descarga de Spotify no pudo obtener el enlace.');
                if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
                    continue; // Reintentar
                } else {
                    return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No se pudo obtener el enlace de descarga de Spotify después de varios intentos.' }, { edit: statusMsg.key });
                }
            }

            const { mp3DownloadLink, songTitle, artist } = result.data;
            const fullTitle = `${songTitle} - ${artist}`;

            await sock.sendMessage(msg.key.remoteJid, { text: `Descargando: *${fullTitle}*` }, { edit: statusMsg.key });

            await sock.sendMessage(msg.key.remoteJid, { audio: { url: mp3DownloadLink }, mimetype: 'audio/mpeg', fileName: `${fullTitle}.mp3` }, { quoted: statusMsg });
            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Audio de Spotify enviado' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en la descarga de Spotify (Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('Spotify Download API Error Response Data:', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }
}

module.exports = { manejarSpotify, descargarSpotifyDirecto };
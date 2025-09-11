const axios = require('axios');

/**
 * Maneja la búsqueda de canciones desde Spotify.
 * @param {string} query - Término de búsqueda proporcionado por el usuario.
 * @param {object} message - Mensaje original para responder con la información.
 */
async function manejarSpotify(query, message) {
    if (!query) {
        message.reply('Por favor, proporciona el nombre de la canción o artista que deseas buscar.');
        return;
    }

    try {
        message.react('⌛');

        // Buscar información de la canción
        const busqueda = await buscarSpotify(query);
        if (!busqueda.length) {
            throw new Error('No se encontró la canción.');
        }

        const cancion = busqueda[0];

        // Enviar información detallada al usuario con la opción de descarga
        const info = `🎵 *Título:* ${cancion.title}\n🎤 *Artista:* ${cancion.artist}\n💺 *Álbum:* ${cancion.album}\n⏳ *Duración:* ${cancion.duration}\n🔗 *Enlace:* ${cancion.url}\n\n¿Quieres descargar la canción? Escribe 'si'`;

        await message.reply(info);

        message.react('✅');
    } catch (error) {
        console.error('Error al procesar la solicitud de Spotify:', error.message);
        message.react('❌');
        message.reply('❌ Ocurrió un error al procesar tu solicitud.');
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
        const res = await axios.get(`${process.env.API_URL}/search/spotify?query=${formattedQuery}&apikey=${process.env.API_KEY}`);

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
        throw new Error('Fallo en la búsqueda de Spotify.');
    }
}

module.exports = { manejarSpotify };

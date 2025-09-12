const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { MessageMedia } = require('whatsapp-web.js');

// Configuración del cliente de Spotify
const spotifyApi = new SpotifyWebApi({
    clientId: 'TU_CLIENT_ID',
    clientSecret: 'TU_CLIENT_SECRET',
});

/**
 * Descarga música de Spotify, convierte el archivo si es necesario y lo envía al usuario.
 * @param {string} url - URL de la canción o playlist de Spotify.
 * @param {string} formato - Formato de descarga ('audio').
 * @param {object} message - Mensaje original para responder con el archivo.
 */
async function descargarDeSpotify(url, formato = 'audio', message) {
    try {
        console.log(`Descargando ${formato} desde Spotify: ${url}`);

        // Autenticación con Spotify
        const authData = await spotifyApi.clientCredentialsGrant();
        spotifyApi.setAccessToken(authData.body['access_token']);

        // Obtener metadatos de la canción o playlist
        const trackId = url.split('/').pop().split('?')[0];
        const trackData = await spotifyApi.getTrack(trackId);

        console.log(`Obteniendo metadatos de: ${trackData.body.name}`);

        const archivo = `${trackData.body.name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const archivoFinal = `${archivo}.mp3`;

        // Simulación de descarga (reemplazar con lógica real)
        fs.writeFileSync(`${archivo}.webm`, 'Contenido simulado de audio');

        // Convertir a MP3
        await new Promise((resolve, reject) => {
            ffmpeg(`${archivo}.webm`)
                .toFormat('mp3')
                .on('end', () => {
                    console.log('Conversión a MP3 completada.');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('Error al convertir el archivo:', err.message);
                    reject(err);
                })
                .save(archivoFinal);
        });

        // Eliminar el archivo original
        fs.unlinkSync(`${archivo}.webm`);

        // Leer el archivo final y enviarlo al usuario
        const media = MessageMedia.fromFilePath(archivoFinal);
        await message.reply(media);

        // Eliminar el archivo después de enviarlo
        fs.unlinkSync(archivoFinal);
    } catch (error) {
        console.error('Error al descargar de Spotify:', error.message);
        message.reply('Hubo un error al intentar descargar el contenido. Por favor, inténtalo de nuevo.');
    }
}

module.exports = { descargarDeSpotify };

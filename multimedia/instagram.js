const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { MessageMedia } = require('whatsapp-web.js');
const path = require('path');

const downloadDir = path.join(__dirname, '../bot/downloads');

// Crear la carpeta de descargas si no existe
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

/**
 * Descarga videos o música de Instagram usando yt-dlp, convierte el archivo si es necesario y lo envía al usuario.
 * @param {string} url - URL del contenido de Instagram.
 * @param {string} formato - Formato de descarga ('audio' o 'video').
 * @param {object} message - Mensaje original para responder con el archivo.
 */
async function descargarDeInstagram(url, formato = 'video', message) {
    try {
        console.log(`Descargando ${formato} desde Instagram: ${url}`);

        const archivoBase = formato === 'audio' ? 'instagram_audio' : 'instagram_video';
        const extensionFinal = formato === 'audio' ? '.mp3' : '.mp4';
        let archivoFinal = path.join(downloadDir, `${archivoBase}${extensionFinal}`);

        // Ejecutar yt-dlp con más registros
        const outputPattern = path.join(downloadDir, `${archivoBase}.%(ext)s`);
        await ytdlp(url, {
            output: outputPattern,
            format: 'best', // Cambiar a 'best' para mayor compatibilidad
            verbose: true, // Habilitar registros detallados
        }).catch((error) => {
            console.error('Error al ejecutar yt-dlp:', error.message);
            throw new Error('Error al descargar el contenido con yt-dlp.');
        });

        // Verificar si el archivo descargado existe directamente
        if (!fs.existsSync(archivoFinal)) {
            console.error('Archivos disponibles:', fs.readdirSync(downloadDir));
            throw new Error('No se encontró el archivo descargado.');
        }

        console.log(`Archivo descargado: ${archivoFinal}`);

        // Convertir a MP3 si es audio
        if (formato === 'audio') {
            await new Promise((resolve, reject) => {
                ffmpeg(archivoFinal)
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
        }

        // Convertir a MP4 si es necesario
        if (formato === 'video') {
            const archivoConvertido = path.join(downloadDir, `${archivoBase}_convertido${extensionFinal}`);
            await new Promise((resolve, reject) => {
                ffmpeg(archivoFinal)
                    .toFormat('mp4')
                    .on('end', () => {
                        console.log('Conversión a MP4 completada.');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('Error al convertir el archivo a MP4:', err.message);
                        reject(err);
                    })
                    .save(archivoConvertido);
            });

            // Actualizar el archivo final al archivo convertido
            archivoFinal = archivoConvertido;
        }

        // Informar al usuario que el archivo se enviará en unos instantes
        await message.reply('El archivo se está procesando y será enviado en unos instantes.');

        // Leer el archivo final y enviarlo al usuario
        console.log(`Preparando para enviar el archivo: ${archivoFinal}`);

        let media;
        try {
            media = MessageMedia.fromFilePath(archivoFinal);
            console.log('Objeto MessageMedia creado correctamente.');
        } catch (error) {
            console.error('Error al crear el objeto MessageMedia:', error.message);
            throw new Error('No se pudo preparar el archivo para enviarlo.');
        }

        try {
            await message.reply(media);
            console.log('Archivo enviado correctamente.');
        } catch (error) {
            console.error('Error al enviar el archivo:', error.message);
            console.error('Detalles del archivo:', {
                path: archivoFinal,
                size: fs.statSync(archivoFinal).size,
            });
            throw new Error('No se pudo enviar el archivo descargado.');
        }

        // Eliminar el archivo después de enviarlo o en caso de error
        try {
            fs.unlinkSync(archivoFinal);
            console.log('Archivo eliminado correctamente.');
        } catch (err) {
            console.error('Error al eliminar el archivo:', err.message);
        }
    } catch (error) {
        console.error('Error al descargar de Instagram:', error.message);
        message.reply('Hubo un error al intentar descargar el contenido. Por favor, inténtalo de nuevo.');
    }
}

module.exports = { descargarDeInstagram };

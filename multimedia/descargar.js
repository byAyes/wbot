const ytdlp = require('yt-dlp-exec');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { descargarDeInstagram } = require('./instagram');
const axios = require('axios');
const { exec } = require('child_process');

const downloadDir = path.join(__dirname, '../bot/downloads');

// Crear la carpeta de descargas si no existe
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

/**
 * Verifica si un archivo multimedia es válido usando ffprobe.
 * @param {string} filePath - Ruta del archivo a verificar.
 * @returns {Promise<boolean>} - Devuelve true si el archivo es válido, de lo contrario false.
 */
async function esArchivoValido(filePath) {
    return new Promise((resolve) => {
        exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (error) => {
            if (error) {
                console.error(`ffprobe error: ${error.message}`);
                resolve(false);
            } else {
                resolve(true);
            }
        });
    });
}

/**
 * Valida si la URL apunta a un archivo multimedia accesible.
 * @param {string} url - URL a validar.
 * @returns {Promise<boolean>} - Devuelve true si la URL es válida, de lo contrario false.
 */
async function validarURL(url) {
    try {
        const response = await axios.head(url);
        const contentType = response.headers['content-type'];
        console.log(`Validando URL: ${url}, Content-Type: ${contentType}`);

        // Verificar si el tipo de contenido es multimedia
        return contentType && (contentType.startsWith('video/') || contentType.startsWith('audio/'));
    } catch (error) {
        console.error(`Error al validar la URL: ${error.message}`);
        return false;
    }
}

/**
 * Descarga contenido multimedia desde múltiples plataformas.
 * @param {string} url - URL del contenido a descargar.
 * @param {string} formato - Formato de descarga ('audio' o 'video').
 * @param {object} message - Mensaje original para responder con el archivo.
 */
async function descargarMultimedia(url, formato = 'video', message, sock) {
    if (url.includes('instagram.com')) {
        return descargarDeInstagram(url, message, sock);
    }

    try {
        console.log(`Iniciando descarga de ${formato} desde: ${url}`);

        const archivoBase = formato === 'audio' ? 'media_audio' : 'media_video';
        const extensionFinal = formato === 'audio' ? '.mp3' : '.mp4';
        let archivoFinal = path.join(downloadDir, `${archivoBase}${extensionFinal}`);

        // Validar la URL antes de intentar descargar
        const esURLValida = await validarURL(url);
        if (!esURLValida) {
            console.warn('La URL proporcionada no apunta a un archivo multimedia válido. Intentando con yt-dlp...');

            // Usar yt-dlp si la URL no es válida para descarga directa
            const outputPattern = path.join(downloadDir, `${archivoBase}.%(ext)s`);
            await ytdlp(url, {
                output: outputPattern,
                format: formato === 'audio' ? 'bestaudio' : 'best',
                verbose: true,
            }).catch((error) => {
                console.error('Error al ejecutar yt-dlp:', error.message);
                throw new Error('Error al descargar el contenido con yt-dlp.');
            });

            // Verificar si el archivo descargado existe
            if (!fs.existsSync(archivoFinal)) {
                console.error('Archivos disponibles:', fs.readdirSync(downloadDir));
                throw new Error('No se encontró el archivo descargado.');
            }

            console.log(`Archivo descargado con yt-dlp: ${archivoFinal}`);
        } else {
            // Intentar descargar directamente con Axios
            try {
                const response = await axios({
                    method: 'GET',
                    url: url,
                    responseType: 'stream',
                });

                const writer = fs.createWriteStream(archivoFinal);
                response.data.pipe(writer);

                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                console.log(`Archivo descargado con Axios: ${archivoFinal}`);
            } catch (axiosError) {
                console.warn('Error al descargar con Axios, intentando con yt-dlp:', axiosError.message);

                // Si Axios falla, usar yt-dlp
                const outputPattern = path.join(downloadDir, `${archivoBase}.%(ext)s`);
                await ytdlp(url, {
                    output: outputPattern,
                    format: formato === 'audio' ? 'bestaudio' : 'best',
                    verbose: true,
                }).catch((error) => {
                    console.error('Error al ejecutar yt-dlp:', error.message);
                    throw new Error('Error al descargar el contenido.');
                });

                // Verificar si el archivo descargado existe
                if (!fs.existsSync(archivoFinal)) {
                    console.error('Archivos disponibles:', fs.readdirSync(downloadDir));
                    throw new Error('No se encontró el archivo descargado.');
                }

                console.log(`Archivo descargado con yt-dlp: ${archivoFinal}`);
            }
        }

        // Verificar si el archivo descargado es válido
        const esValido = await esArchivoValido(archivoFinal);
        if (!esValido) {
            console.error('El archivo descargado no es válido. Eliminando archivo...');
            fs.unlinkSync(archivoFinal);
            throw new Error('El archivo descargado está corrupto o no es válido.');
        }

        // Convertir a MP3 o MP4 si es necesario
        if (formato === 'audio' || formato === 'video') {
            const archivoConvertido = path.join(downloadDir, `${archivoBase}_convertido${extensionFinal}`);
            await new Promise((resolve, reject) => {
                ffmpeg(archivoFinal)
                    .toFormat(formato === 'audio' ? 'mp3' : 'mp4')
                    .on('end', () => {
                        console.log('Conversión completada.');
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error('Error al convertir el archivo:', err.message);
                        reject(err);
                    })
                    .save(archivoConvertido);
            });

            // Actualizar el archivo final al archivo convertido
            archivoFinal = archivoConvertido;
        }

        // Leer el archivo final y enviarlo al usuario
        console.log(`Preparando para enviar el archivo: ${archivoFinal}`);

        let media;
        try {
            media = MessageMedia.fromFilePath(archivoFinal);
            console.log('Objeto MessageMedia creado correctamente.');
            console.log(`Detalles del archivo: Tamaño = ${fs.statSync(archivoFinal).size} bytes, Ruta = ${archivoFinal}`);
        } catch (error) {
            console.error('Error al crear el objeto MessageMedia:', error.message);
            throw new Error('No se pudo preparar el archivo para enviarlo.');
        }

        try {
            if (formato === 'video') {
                await sock.sendMessage(message.key.remoteJid, { video: { url: archivoFinal }, caption: 'Aqui tienes tu video' }, { quoted: message });
            } else {
                await sock.sendMessage(message.key.remoteJid, { audio: { url: archivoFinal }, mimetype: 'audio/mp4' }, { quoted: message });
            }
            console.log('Archivo enviado correctamente.');
        } catch (error) {
            console.error('Error al enviar el archivo:', error.message);
            console.error('Detalles del archivo:', {
                path: archivoFinal,
                size: fs.statSync(archivoFinal).size,
            });
            throw new Error('No se pudo enviar el archivo descargado.');
        }

        // Eliminar el archivo después de enviarlo
        try {
            fs.unlinkSync(archivoFinal);
            console.log('Archivo eliminado correctamente.');
        } catch (err) {
            console.error('Error al eliminar el archivo:', err.message);
        }
    } catch (error) {
        console.error('Error al descargar multimedia:', error.message);
        sock.sendMessage(message.key.remoteJid, { text: 'Hubo un error al intentar descargar el contenido. Por favor, inténtalo de nuevo.' }, { quoted: message });
    }
}

module.exports = { descargarMultimedia };

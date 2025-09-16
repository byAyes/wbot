const axios = require('axios');
const fs = require('fs');
const path = require('path');

const downloadDir = path.join('/tmp', 'downloads');

// Crear la carpeta de descargas si no existe
if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
}

/**
 * Descarga videos de Instagram usando la API y lo envía al usuario.
 * @param {string} url - URL del contenido de Instagram.
 * @param {object} message - Mensaje original para responder con el archivo.
 * @param {object} sock - Instancia del socket de Baileys.
 */
async function descargarDeInstagram(url, message, sock) {
    try {
        await sock.sendMessage(message.key.remoteJid, { text: 'Descargando contenido...' }, { quoted: message });
        console.log(`Descargando desde Instagram: ${url}`);

        const apiUrl = `${process.env.ALTERNATIVE_API_URL}/api/d/igdl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);

        if (response.data && response.data.status === true && response.data.data && response.data.data.length > 0) {
            const media = response.data.data[0];
            const mediaUrl = media.url;
            
            // Usar el nombre de archivo de la API si está disponible, si no, generar uno.
            const fileName = media.filename || `instagram_${Date.now()}.mp4`;
            const filePath = path.join(downloadDir, fileName);

            const mediaResponse = await axios({
                url: mediaUrl,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(filePath);
            mediaResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`Enviando video: ${filePath}`);
            await sock.sendMessage(
                message.key.remoteJid, 
                { video: { url: filePath }, caption: '¡Aquí tienes tu video de Instagram!' }, 
                { quoted: message }
            );

            // Esperar un poco antes de eliminar para asegurar el envío
            setTimeout(() => {
                fs.unlink(filePath, (err) => {
                    if (err) {
                        console.error('Error al eliminar el archivo:', err);
                    } else {
                        console.log(`Archivo eliminado: ${filePath}`);
                    }
                });
            }, 1000);

        } else {
            console.log('Respuesta de la API no válida:', response.data);
            throw new Error('No se pudo obtener el contenido de Instagram o la respuesta de la API no fue la esperada.');
        }
    } catch (error) {
        console.error('Error al descargar de Instagram:', error);
        let errorMessage = 'Hubo un error al intentar descargar el contenido. Por favor, inténtalo de nuevo.';
        if (error.response) {
            console.error('Error de la API:', error.response.status, error.response.data);
            errorMessage = `Error de la API: ${error.response.status}. No se pudo procesar el video.`;
        }
        sock.sendMessage(message.key.remoteJid, { text: errorMessage }, { quoted: message });
    }
}

module.exports = { descargarDeInstagram };


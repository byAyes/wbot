const axios = require('axios');

/**
 * Normaliza una URL de Pinterest eliminando subdominios de país (ej. co, es, mx).
 * @param {string} url - La URL de Pinterest original.
 * @returns {string} - La URL normalizada.
 */
function normalizarUrlPinterest(url) {
    // Esta expresión regular busca `//<dos-letras>.pinterest.com` y lo reemplaza
    return url.replace(/\/\/([a-z]{2})\.pinterest\.com/, '//pinterest.com');
}

/**
 * Descarga contenido desde Pinterest usando la API de stellarwa.xyz.
 * @param {string} url - URL del contenido de Pinterest.
 * @param {object} msg - Mensaje original para responder.
 * @param {object} sock - Instancia del socket de Baileys.
 */
async function descargarPinterest(url, msg, sock, retries = 3) {
    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: 'Procesando enlace de Pinterest...' }, { quoted: msg });

    // Intento con la API principal
    for (let i = 0; i < retries; i++) {
        try {
            const normalizedUrl = normalizarUrlPinterest(url);

            const response = await axios.get(`${process.env.API_URL}/dow/pinterest?url=${encodeURIComponent(normalizedUrl)}&apikey=${process.env.API_KEY}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = response.data;

            if (!result.status || !result.data?.dl) {
                // Si la API principal devuelve un error específico o no encuentra el DL, no reintentar con ella
                console.error('API principal de Pinterest no pudo obtener el enlace de descarga.');
                break; // Salir del bucle de reintentos de la API principal
            }

            const { dl, title } = result.data;
            const mediaType = 'image'; // Asumiendo que la API principal devuelve imágenes

            await sock.sendMessage(msg.key.remoteJid, { text: `Descargando: *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(msg.key.remoteJid, { [mediaType]: { url: dl }, caption: title }, { quoted: statusMsg });

            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Contenido de Pinterest enviado.' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en la descarga de Pinterest (Principal - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('Pinterest API Error Response Data (Principal):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    // Si la API principal falla después de todos los reintentos, intentar con la alternativa
    console.log('API principal de Pinterest falló. Intentando con la API alternativa...');
    for (let i = 0; i < retries; i++) {
        try {
            const normalizedUrl = normalizarUrlPinterest(url);
            const alternativeApiUrl = `${process.env.ALTERNATIVE_API_URL}/api/d/pinterest?url=${encodeURIComponent(normalizedUrl)}`; // Asumiendo que la API alternativa tiene un endpoint similar
            console.log('Pinterest API URL (Alternativa):', alternativeApiUrl);

            const response = await axios.get(alternativeApiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = response.data;

            if (!result.status || !result.data?.media_urls || result.data.media_urls.length === 0) {
                return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No se pudo obtener el enlace de descarga desde la API alternativa.' }, { edit: statusMsg.key });
            }

            const dl = result.data.media_urls[0].url;
            const title = result.data.title || 'Contenido de Pinterest';
            const mediaType = result.data.media_urls[0].type === 'video' ? 'video' : 'image';

            await sock.sendMessage(msg.key.remoteJid, { text: `Descargando (Alternativa): *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(msg.key.remoteJid, { [mediaType]: { url: dl }, caption: title }, { quoted: statusMsg });

            await sock.sendMessage(msg.key.remoteJid, { text: '✅ Contenido de Pinterest enviado (Alternativa).' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en la descarga de Pinterest (Alternativa - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('Pinterest API Error Response Data (Alternativa):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al procesar tu solicitud de Pinterest después de varios intentos con ambas APIs.' }, { edit: statusMsg.key });
}

module.exports = { descargarPinterest };
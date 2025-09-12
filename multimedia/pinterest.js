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
async function descargarPinterest(url, msg, sock) {
    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: 'Procesando enlace de Pinterest...' }, { quoted: msg });

    try {
        const normalizedUrl = normalizarUrlPinterest(url);

        const response = await fetch(`${process.env.API_URL}/dow/pinterest?url=${encodeURIComponent(normalizedUrl)}&apikey=${process.env.API_KEY}`);
        const result = await response.json();

        if (!result.status || !result.data?.dl) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No se pudo obtener el enlace de descarga desde la API.' }, { quoted: msg });
        }

        const { dl, title } = result.data;

        await sock.sendMessage(msg.key.remoteJid, { text: `Descargando: *${title}*` }, { quoted: msg });

        // Detect if it's a video or image
        const isVideo = dl.includes('.mp4');
        const mediaType = isVideo ? 'video' : 'image';

        await sock.sendMessage(msg.key.remoteJid, { [mediaType]: { url: dl }, caption: title }, { quoted: msg });

        await sock.sendMessage(msg.key.remoteJid, { text: '✅ Contenido de Pinterest enviado.' }, { quoted: msg });

    } catch (error) {
        console.error('Error en la descarga de Pinterest:', error);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al procesar tu solicitud de Pinterest.' }, { quoted: msg });
    }
}

module.exports = { descargarPinterest };
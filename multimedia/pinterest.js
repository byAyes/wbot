const { MessageMedia } = require('whatsapp-web.js');

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
 * @param {object} message - Mensaje original para responder.
 */
async function descargarPinterest(url, message) {
    const statusMsg = await message.reply('Procesando enlace de Pinterest...');

    try {
        const normalizedUrl = normalizarUrlPinterest(url);

        const response = await fetch(`${process.env.API_URL}/dow/pinterest?url=${encodeURIComponent(normalizedUrl)}&apikey=${process.env.API_KEY}`);
        const result = await response.json();

        if (!result.status || !result.data?.dl) {
            return await statusMsg.edit('❌ No se pudo obtener el enlace de descarga desde la API.');
        }

        const { dl, title } = result.data;

        await statusMsg.edit(`Descargando: *${title}*`);

        const media = await MessageMedia.fromUrl(dl, { unsafeMime: true });
        
        const chat = await statusMsg.getChat();
        await chat.sendMessage(media, { caption: title });

        await statusMsg.edit('✅ Contenido de Pinterest enviado.');

    } catch (error) {
        console.error('Error en la descarga de Pinterest:', error);
        await statusMsg.edit('Hubo un error al procesar tu solicitud de Pinterest.');
    }
}

module.exports = { descargarPinterest };

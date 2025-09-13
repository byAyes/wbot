const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const axios = require('axios');

const ALTERNATIVE_API_URL = 'https://api.siputzx.my.id';

// --- Funciones Auxiliares ---

async function buscarPrimerVideoAPI(searchTerm, retries = 3) {
    // Intento con la API principal
    for (let i = 0; i < retries; i++) {
        try {
            const apiUrl = `${process.env.API_URL}/search/yt?query=${encodeURIComponent(searchTerm)}&apikey=${process.env.API_KEY}`;
            console.log('YouTube API URL (Principal):', apiUrl);
            const searchResponse = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            console.log('YouTube API Response Status (Principal):', searchResponse.status);
            const searchResult = searchResponse.data;
            console.log('YouTube API Response Body (Principal):', searchResult);
            if (searchResult.status && searchResult.result?.length) {
                return searchResult.result[0];
            }
        } catch (error) {
            console.error(`Error al buscar en la API de YT (Principal - Intento ${i + 1}/${retries}):`, error.message);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Principal):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    // Si la API principal falla después de todos los reintentos, intentar con la alternativa
    console.log('API principal de YouTube falló. Intentando con la API alternativa...');
    for (let i = 0; i < retries; i++) {
        try {
            const alternativeApiUrl = `${ALTERNATIVE_API_URL}/api/s/youtube?query=${encodeURIComponent(searchTerm)}`;
            console.log('YouTube API URL (Alternativa):', alternativeApiUrl);
            const searchResponse = await axios.get(alternativeApiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            console.log('YouTube API Response Status (Alternativa):', searchResponse.status);
            const searchResult = searchResponse.data;
            console.log('YouTube API Response Body (Alternativa):', searchResult);
            if (searchResult.status && searchResult.result?.length) {
                return searchResult.result[0];
            }
        } catch (error) {
            console.error(`Error al buscar en la API de YT (Alternativa - Intento ${i + 1}/${retries}):`, error.message);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Alternativa):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    return null; // Si ambas APIs fallan después de todos los reintentos
}

// --- Manejador de Comandos ---

async function manejarBusquedaYouTube(searchTerm, msg, sock) {
    const statusMsg = await sock.sendMessage(msg.key.remoteJid, { text: `Buscando "${searchTerm}" en YouTube...` }, { quoted: msg });
    try {
        const firstResult = await buscarPrimerVideoAPI(searchTerm);

        if (!firstResult) {
            return await sock.sendMessage(msg.key.remoteJid, { text: '❌ No se encontraron resultados para tu búsqueda.' }, { edit: statusMsg.key });
        }

        const { title, autor, duration, url } = firstResult;
        const confirmationText = `Encontré esto:\n\n🎵 *Título:* ${title}\n👤 *Autor:* ${autor}\n⏳ *Duración:* ${duration}\n\n¿Descargar como audio o video? Responde "audio" o "video".`;
        await sock.sendMessage(msg.key.remoteJid, { text: confirmationText }, { edit: statusMsg.key });

        // Baileys doesn't have a concept of a message listener like wweb.js
        // The logic for handling the "audio" or "video" response is now in index.js
        // This function is now responsible for just the search and confirmation

    } catch (error) {
        console.error('Error en manejarBusquedaYouTube:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Hubo un error al procesar tu búsqueda.' }, { edit: statusMsg.key });
    }
}

// --- Funciones de Descarga ---

async function descargarAudioAPI(url, statusMsg, sock, retries = 3) {
    // Intento con la API principal
    for (let i = 0; i < retries; i++) {
        try {
            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de audio de la API (Principal)' }, { edit: statusMsg.key });
            const response = await axios.get(`${process.env.API_URL}/dow/ytmp3v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = response.data;

            if (!result.status || !result.data?.dl) {
                console.error('API principal de YouTube no pudo obtener el audio.');
                break; // Salir del bucle de reintentos de la API principal
            }

            const { dl, title } = result.data;
            await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando audio: *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(statusMsg.key.remoteJid, { audio: { url: dl }, mimetype: 'audio/mpeg' }, { quoted: statusMsg });
            await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Audio enviado' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en descarga de audio (Principal - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Principal):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    // Si la API principal falla después de todos los reintentos, intentar con la alternativa
    console.log('API principal de YouTube para audio falló. Intentando con la API alternativa...');
    for (let i = 0; i < retries; i++) {
        try {
            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de audio de la API (Alternativa)' }, { edit: statusMsg.key });
            const alternativeApiUrl = `${ALTERNATIVE_API_URL}/api/ytmp3?url=${encodeURIComponent(url)}`; // Asumiendo un endpoint similar
            const response = await axios.get(alternativeApiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = response.data;

            if (!result.status || !result.data?.dl) {
                return await sock.sendMessage(statusMsg.key.remoteJid, { text: '🐼 Error al obtener el audio desde la API alternativa.' }, { edit: statusMsg.key });
            }

            const { dl, title } = result.data;
            await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando audio (Alternativa): *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(statusMsg.key.remoteJid, { audio: { url: dl }, mimetype: 'audio/mpeg' }, { quoted: statusMsg });
            await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Audio enviado (Alternativa)' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en descarga de audio (Alternativa - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Alternativa):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Hubo un error al descargar el audio después de varios intentos con ambas APIs.' }, { edit: statusMsg.key });
}

async function descargarVideoAPI(url, statusMsg, sock, retries = 3) {
    // Intento con la API principal
    for (let i = 0; i < retries; i++) {
        try {
            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de video de la API (Principal)' }, { edit: statusMsg.key });
            const apiResponse = await axios.get(`${process.env.API_URL}/dow/ytmp4v2?url=${encodeURIComponent(url)}&apikey=${process.env.API_KEY}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = apiResponse.data;

            if (!result.status || !result.data?.dl) {
                console.error('API principal de YouTube no pudo obtener el video.');
                break; // Salir del bucle de reintentos de la API principal
            }

            const { dl, title } = result.data;

            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Comprobando tamaño del video...' }, { edit: statusMsg.key });
            const headResponse = await axios.head(dl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const contentLength = headResponse.headers.get('Content-Length');
            const fileSizeMB = parseInt(contentLength || '0', 10) / (1024 * 1024);

            const limit = 15; // Límite de 15 MB
            const asDocument = fileSizeMB >= limit;

            if (asDocument) {
                await sock.sendMessage(statusMsg.key.remoteJid, { text: `El video pesa ${fileSizeMB.toFixed(2)} MB. Se enviará como documento.` }, { edit: statusMsg.key });
            }

            await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando video: *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(statusMsg.key.remoteJid, { video: { url: dl }, caption: title }, { quoted: statusMsg });
            await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Video enviado' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en descarga de video (Principal - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Principal):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    // Si la API principal falla después de todos los reintentos, intentar con la alternativa
    console.log('API principal de YouTube para video falló. Intentando con la API alternativa...');
    for (let i = 0; i < retries; i++) {
        try {
            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Obteniendo enlace de video de la API (Alternativa)' }, { edit: statusMsg.key });
            const alternativeApiUrl = `${ALTERNATIVE_API_URL}/api/ytmp4?url=${encodeURIComponent(url)}`; // Asumiendo un endpoint similar
            const apiResponse = await axios.get(alternativeApiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const result = apiResponse.data;

            if (!result.status || !result.data?.dl) {
                return await sock.sendMessage(statusMsg.key.remoteJid, { text: '🐼 Error al obtener el video desde la API alternativa.' }, { edit: statusMsg.key });
            }

            const { dl, title } = result.data;

            await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Comprobando tamaño del video...' }, { edit: statusMsg.key });
            const headResponse = await axios.head(dl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36'
                }
            });
            const contentLength = headResponse.headers.get('Content-Length');
            const fileSizeMB = parseInt(contentLength || '0', 10) / (1024 * 1024);

            const limit = 15; // Límite de 15 MB
            const asDocument = fileSizeMB >= limit;

            if (asDocument) {
                await sock.sendMessage(statusMsg.key.remoteJid, { text: `El video pesa ${fileSizeMB.toFixed(2)} MB. Se enviará como documento.` }, { edit: statusMsg.key });
            }

            await sock.sendMessage(statusMsg.key.remoteJid, { text: `Descargando video (Alternativa): *${title}*` }, { edit: statusMsg.key });

            await sock.sendMessage(statusMsg.key.remoteJid, { video: { url: dl }, caption: title }, { quoted: statusMsg });
            await sock.sendMessage(statusMsg.key.remoteJid, { text: '✅ Video enviado (Alternativa)' }, { edit: statusMsg.key });
            return; // Exit after successful download

        } catch (error) {
            console.error(`Error en descarga de video (Alternativa - Intento ${i + 1}/${retries}):`, error);
            if (axios.isAxiosError(error) && error.response) {
                console.error('YouTube API Error Response Data (Alternativa):', error.response.data);
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo antes de reintentar
            }
        }
    }

    await sock.sendMessage(statusMsg.key.remoteJid, { text: 'Hubo un error al descargar el video después de varios intentos con ambas APIs.' }, { edit: statusMsg.key });
}

module.exports = { manejarBusquedaYouTube, buscarPrimerVideoAPI, descargarAudioAPI, descargarVideoAPI };
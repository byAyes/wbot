/**
 * KnowledgeBase - Loads and searches the bot's knowledge base for RAG
 */
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class KnowledgeBase {
  constructor() {
    this.documents = [];
    this.loadDocuments();
  }

  loadDocuments() {
    const docsDir = path.join(__dirname, '..', 'knowledge');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
      this.createDefaultDocuments(docsDir);
    }

    const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(docsDir, file), 'utf8');
      this.documents.push({
        name: file,
        content,
        chunks: this.chunkText(content, 500),
      });
    }
    logger.info(`KnowledgeBase cargado: ${this.documents.length} documentos`);
  }

  createDefaultDocuments(docsDir) {
    const faq = `# FAQ - Carlos Bot

## Comandos disponibles
- /play <query> - Reproduce música en canal de voz (YouTube, Spotify, SoundCloud, Deezer)
- /music download <query> [formato] - Descarga audio/video
- /music skip, stop, pause, resume - Control de reproducción
- /spotify <query> - Busca y descarga de Spotify
- /pinterest <url> - Descarga de Pinterest
- /instagram <url> - Descarga de Instagram
- /birthday set <DD-MM-YYYY> - Guarda tu cumpleaños
- /birthday list - Próximos cumpleaños
- /reminder set <fecha> <mensaje> - Configura un recordatorio
- /chat <pregunta> - Pregunta algo al asistente IA
- /help - Muestra todos los comandos

## Límites
- Archivos máximos: 25MB (Discord)
- Rate limit: 10 msgs IA por minuto
- Recordatorios máximo: 50 por usuario

## Soporte
Si tienes problemas, usa /help o contacta al administrador del servidor.
`;
    fs.writeFileSync(path.join(docsDir, 'faq.md'), faq);
    this.documents.push({
      name: 'faq.md',
      content: faq,
      chunks: this.chunkText(faq, 500),
    });
  }

  chunkText(text, chunkSize) {
    const chunks = [];
    const sentences = text.split(/[.!?]\s+/);
    let current = '';
    for (const sentence of sentences) {
      if (current.length + sentence.length > chunkSize) {
        if (current) chunks.push(current.trim());
        current = sentence;
      } else {
        current += ' ' + sentence;
      }
    }
    if (current) chunks.push(current.trim());
    return chunks.filter(c => c.length > 10);
  }

  /**
   * Search for relevant chunks based on keyword matching
   * @param {string} query
   * @param {number} maxChunks
   * @returns {string[]}
   */
  search(query, maxChunks = 3) {
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const results = [];

    for (const doc of this.documents) {
      for (const chunk of doc.chunks) {
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        for (const word of queryWords) {
          if (chunkLower.includes(word)) score++;
        }
        if (score > 0) {
          results.push({ chunk, score, doc: doc.name });
        }
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxChunks)
      .map(r => r.chunk);
  }
}

module.exports = KnowledgeBase;
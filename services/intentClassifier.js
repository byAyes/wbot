/**
 * IntentClassifier - Lightweight intent classification for hybrid AI routing
 * Uses regex patterns first, falls back to LLM for ambiguous cases
 */
const logger = require('../utils/logger');

// Intent patterns: [regex, intentName, commandToRoute]
const INTENT_PATTERNS = [
  // Music / playback
  { pattern: /\b(reproducir|play|poner|pon|música|canci[oó]n|audio|sonar|meter|poner\s+m[uú]sica)\b/i, intent: 'play', command: 'play' },
  { pattern: /\b(descargar|download|descarga|bajar|get)\b/i, intent: 'download', command: 'download' },
  { pattern: /\b(spotify|yt|youtube|soundcloud|deezer|sc)\b/i, intent: 'music_source', command: 'music' },
  { pattern: /\b(skip|saltar|siguiente|next|pausar|pause|reanudar|resume|parar|stop|detener|volumen|volume|cola|queue|loop|repetir|shuffle|aleatorio)\b/i, intent: 'music_control', command: 'music' },

  // Social downloads
  { pattern: /\b(pinterest|pin|tabl[uú]o)\b/i, intent: 'pinterest', command: 'pinterest' },
  { pattern: /\b(instagram|ig| reel|reels)\b/i, intent: 'instagram', command: 'instagram' },

  // Birthdays
  { pattern: /\b(cumpleaños|birthday|cumple|fechas?\s+de\s+cumpleaños)\b/i, intent: 'birthday', command: 'birthday' },

  // Reminders
  { pattern: /\b(recordatorio|recordar|reminder|recordarme|acordar|acuérdate)\b/i, intent: 'reminder', command: 'reminder' },

  // Hall of Shame
  { pattern: /\b(hall\s+of\s+shame|hos|nominar|shame|vergar|sinvergüenza)\b/i, intent: 'hos', command: 'hos' },

  // Utility
  { pattern: /\b(ping|latencia|hora|date|hora\s+actual|fecha)\b/i, intent: 'utility', command: 'utility' },
  { pattern: /\b(ayuda|help|comandos|qué\s+haces|qué\s+haces\s+t[uú])\b/i, intent: 'help', command: 'help' },
  { pattern: /\b(invitar|invite|agregar|añadir)\b/i, intent: 'invite', command: 'invite' },
];

// Intents that should go to LLM for conversational response
const CONVERSATIONAL_INTENTS = ['general_question', 'complaint', 'praise', 'joke', 'greeting'];

class IntentClassifier {
  constructor() {
    this.patterns = INTENT_PATTERNS;
  }

  /**
   * Classify a message intent
   * @param {string} message
   * @returns {object} { intent, confidence, command, needsLLM }
   */
  classify(message) {
    if (!message || typeof message !== 'string') {
      return { intent: 'unknown', confidence: 0, command: null, needsLLM: true };
    }

    const lower = message.toLowerCase().trim();
    let bestMatch = { intent: 'unknown', confidence: 0, command: null };

    for (const { pattern, intent, command } of this.patterns) {
      if (pattern.test(lower)) {
        // Calculate confidence based on word overlap
        const words = lower.split(/\s+/).filter(w => w.length > 2);
        const matchedWords = words.filter(w => pattern.source.includes(w));
        const confidence = Math.min(0.95, 0.5 + (matchedWords.length / Math.max(1, words.length)) * 0.5);

        if (confidence > bestMatch.confidence) {
          bestMatch = { intent, confidence, command };
        }
      }
    }

    // If no strong match, mark as needing LLM
    const needsLLM = bestMatch.confidence < 0.4;
    return { ...bestMatch, needsLLM };
  }

  /**
   * Extract parameters from a message based on intent
   * @param {string} message
   * @param {string} intent
   * @returns {object} Extracted parameters
   */
  extractParams(message, intent) {
    const params = {};

    switch (intent) {
      case 'play':
      case 'download':
      case 'spotify':
        // Extract the query (everything after the intent verb)
        const match = message.match(/(?:reproducir|play|descargar|download|spotify|busca|busca|encuentra)\s+(.+)/i);
        params.query = match ? match[1].trim() : message;
        break;

      case 'reminder':
        // Extract date/time and message
        params.message = message;
        break;

      case 'birthday':
        const bdayMatch = message.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?/);
        if (bdayMatch) {
          params.day = parseInt(bdayMatch[1]);
          params.month = parseInt(bdayMatch[2]);
          params.year = bdayMatch[3] ? parseInt(bdayMatch[3]) : new Date().getFullYear();
        }
        break;
    }

    return params;
  }
}

module.exports = IntentClassifier;
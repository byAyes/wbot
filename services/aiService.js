/**
 * AIService - Wrapper for LLM providers using axios directly (no extra deps)
 * Supports OpenAI, Groq, and Anthropic via their REST APIs
 */
const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
    this.maxRetries = parseInt(process.env.AI_MAX_RETRIES) || 2;
    this.timeout = parseInt(process.env.AI_TIMEOUT_MS) || 10000;
    this.maxTokens = parseInt(process.env.AI_MAX_TOKENS) || 500;
  }

  _getEndpoint() {
    const endpoints = {
      openai: 'https://api.openai.com/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      anthropic: 'https://api.anthropic.com/v1/messages',
    };
    return endpoints[this.provider];
  }

  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.provider === 'anthropic') {
      headers['x-api-key'] = process.env.ANTHROPIC_API_KEY;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${this._getApiKey()}`;
    }
    return headers;
  }

  _getApiKey() {
    const keys = {
      openai: process.env.OPENAI_API_KEY,
      groq: process.env.GROQ_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };
    return keys[this.provider];
  }

  _getModel() {
    if (this.provider === 'openai') return process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (this.provider === 'groq') return process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
    if (this.provider === 'anthropic') return process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    return 'gpt-4o-mini';
  }

  isConfigured() {
    return !!this._getApiKey();
  }

  async chat(messages, options = {}) {
    const model = options.model || this._getModel();
    const maxTokens = options.maxTokens || this.maxTokens;
    const temperature = options.temperature ?? 0.7;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        let body;
        if (this.provider === 'anthropic') {
          // Anthropic expects different format: system as top-level, messages without system
          const systemMsg = messages.find(m => m.role === 'system');
          const nonSystem = messages.filter(m => m.role !== 'system');
          body = {
            model,
            messages: nonSystem,
            max_tokens: maxTokens,
            temperature,
            system: systemMsg?.content,
          };
        } else {
          body = { model, messages, max_tokens: maxTokens, temperature };
        }

        const response = await axios.post(this._getEndpoint(), body, {
          headers: this._getHeaders(),
          timeout: this.timeout,
        });

        let content, tokensUsed, responseModel;

        if (this.provider === 'anthropic') {
          content = response.data.content?.[0]?.text || '';
          tokensUsed = (response.data.usage?.input_tokens || 0) + (response.data.usage?.output_tokens || 0);
          responseModel = response.data.model;
        } else {
          content = response.data.choices?.[0]?.message?.content || '';
          tokensUsed = response.data.usage?.total_tokens || 0;
          responseModel = response.data.model;
        }

        return { content, tokensUsed, model: responseModel };
      } catch (error) {
        const msg = error.response?.data?.error?.message || error.message;
        if (attempt === this.maxRetries) {
          throw new Error(`IA (${this.provider}): ${msg}`);
        }
        logger.warn(`AI attempt ${attempt + 1} failed: ${msg}`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
}

module.exports = AIService;
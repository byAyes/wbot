const axios = require('axios');
const logger = require('./logger');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Makes an API call with retry logic
 * @param {string} url - The URL to call
 * @param {object} options - Axios options
 * @param {number} retries - Number of retries
 * @returns {Promise<object>} - Response data
 */
async function apiCall(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios({
        url,
        headers: {
          'User-Agent': USER_AGENT,
          ...options.headers,
        },
        timeout: 30000,
        ...options,
      });
      return response.data;
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      logger.warn(`API call failed (${i + 1}/${retries}): ${url} - ${error.message}`);

      if (axios.isAxiosError(error) && error.response) {
        logger.debug('API Error Response:', error.response.data);
      }

      if (isLastAttempt) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}

/**
 * Gets the file size of a URL
 * @param {string} url - The URL to check
 * @returns {Promise<number>} - File size in MB
 */
async function getFileSizeMB(url) {
  try {
    const response = await axios.head(url, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
    });
    const contentLength = response.headers['content-length'];
    if (contentLength) {
      return parseInt(contentLength, 10) / (1024 * 1024);
    }
  } catch (error) {
    logger.warn('Could not check file size:', error.message);
  }
  return 0;
}

module.exports = {
  apiCall,
  getFileSizeMB,
  USER_AGENT,
};

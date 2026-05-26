const chalk = require('chalk');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL] || LOG_LEVELS.INFO;

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
}

const logger = {
  debug: (...args) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(chalk.gray(`[${getTimestamp()}] [DEBUG]`), ...args);
    }
  },

  info: (...args) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(chalk.cyan(`[${getTimestamp()}] [INFO]`), ...args);
    }
  },

  success: (...args) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(chalk.green(`[${getTimestamp()}] [✓]`), ...args);
    }
  },

  warn: (...args) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.log(chalk.yellow(`[${getTimestamp()}] [WARN]`), ...args);
    }
  },

  error: (...args) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(chalk.red(`[${getTimestamp()}] [ERROR]`), ...args);
    }
  },

  command: (commandName, userId, userName) => {
    console.log(chalk.magenta(`[${getTimestamp()}] [/]`), chalk.bold(commandName), `by ${chalk.underline(userName)} (${userId})`);
  },

  divider: () => {
    console.log(chalk.dim('─'.repeat(50)));
  },

  startup: (text) => {
    console.log(chalk.bold.green(`\n🚀 ${text}`));
  },
};

module.exports = logger;

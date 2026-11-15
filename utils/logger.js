const chalk = require('chalk');

const { IS_PROD, SHOULD_FORCE_DEBUG_LOGS } = require('./constants');

const store = {};

const info = (message) => console.log(`${chalk.white.inverse(` [${(new Date()).toLocaleTimeString()}] - INFO    `)} ${chalk.white(message)}`);
const error = (message) => console.log(`${chalk.red.inverse(` [${(new Date()).toLocaleTimeString()}] - ERROR   `)} ${chalk.red(message)}`);
const success = (message) => console.log(`${chalk.green.inverse(` [${(new Date()).toLocaleTimeString()}] - SUCCESS `)} ${chalk.green(message)}`);
const debug = (message) => {
  if (!SHOULD_FORCE_DEBUG_LOGS && IS_PROD) return;
  console.log(`${chalk.magenta.inverse(` [${(new Date()).toLocaleTimeString()}] - DEBUG   `)} ${chalk.magenta(message)}`);
};
const warn = (message) => console.log(`${chalk.yellow.inverse(` [${(new Date()).toLocaleTimeString()}] - WARN    `)} ${chalk.yellow(message)}`);

const logClassifiedFailure = (url, ipAddr, status, detail) => {
  warn(`Attempt to view ${url} with IP: ${ipAddr} failed. Classification: ${status}${detail ? ` | Detail: ${detail}` : ''}`);
};

const logCount = async (page, url, ipAddr, duration) => {
  try {
    const currentLiveViewCount = await page.$eval('.view-count', (viewCountNode) => viewCountNode.innerText.replace(/[^0-9]/g, ''));
    if (!store[url]) store[url] = { initial: currentLiveViewCount };
    store[url].current = currentLiveViewCount;
    store[url].added = store[url].current - store[url].initial;
    success(`Attempted ${url} with IP: ${ipAddr} for ${duration} seconds. (Init View Count: ${store[url].initial} Current View Count: ${store[url].current} Views added this session: ${store[url].added})`);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  logCount,
  logClassifiedFailure,
  info,
  error,
  warn,
  success,
  debug,
};

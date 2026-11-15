const puppeteer = require('../core/puppeteer');
const { logger, resourceMonitor } = require('../utils');
const { IS_PROD, BROWSER_RECYCLE_RSS_MB } = require('../utils/constants');

const browsers = new Map();

const isUsable = (browser) => browser && typeof browser.isConnected === 'function' && browser.isConnected();

const launchOne = async (port) => {
  const browser = await puppeteer.launchBrowser(port);
  browsers.set(port, browser);
  logger.debug(`Browser launched for port ${port}`);
  return browser;
};

const ensureBrowsers = async (ports) => {
  for (const port of ports) {
    if (!isUsable(browsers.get(port))) {
      if (browsers.has(port)) browsers.delete(port);
      try {
        await launchOne(port);
      } catch (error) {
        logger.warn(`Failed to launch browser for port ${port}.`);
        logger.debug(error);
      }
    }
  }
};

const getBrowser = (port) => browsers.get(port);

const closeAll = async () => {
  const closing = Array.from(browsers.values()).map((browser) => browser.close().catch(() => {}));
  browsers.clear();
  await Promise.all(closing);
};

const recycleIfNeeded = async () => {
  if (!IS_PROD) return false;
  const rssMb = resourceMonitor.getChromiumRssMb();
  if (rssMb < BROWSER_RECYCLE_RSS_MB) return false;
  logger.warn(`Chromium RSS ${rssMb} MB exceeds recycle threshold ${BROWSER_RECYCLE_RSS_MB} MB. Restarting browsers.`);
  await closeAll();
  return true;
};

module.exports = { ensureBrowsers, getBrowser, closeAll, recycleIfNeeded };

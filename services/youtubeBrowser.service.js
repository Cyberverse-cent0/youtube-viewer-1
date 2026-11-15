const _shuffle = require('lodash/shuffle');
const _take = require('lodash/take');

const puppeteer = require('../core/puppeteer');
const { watchVideosInSequence } = require('../helpers');
const { blockHeavyResources } = require('../helpers/resourceBlocker');
const { logger } = require('../utils');
const { ERROR_TYPES, classifyError } = require('../utils/errorTypes');
const { attachPageMonitor } = require('../utils/pageMonitor');
const { captureCrashArtifacts } = require('../utils/crashArtifacts');
const { VIEW_ACTION_COUNT, IP_GETTER_URL, PAGE_DEFAULT_TIMEOUT } = require('../utils/constants');

const getCurrentIP = async (page) => {
  await page.goto(IP_GETTER_URL, { waitUntil: 'load' });
  return page.$eval('body', (body) => body.innerText);
};

const getCurrentIPSafe = async (page) => {
  try {
    return await getCurrentIP(page);
  } catch (error) {
    logger.warn('Failed to fetch current IP. Continuing without it.');
    logger.debug(error);
    return 'unknown';
  }
};

const tallyStatuses = (results) => results.reduce((acc, { status }) => {
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, {});

const viewVideosInBatch = async ({ targetUrls, durationInSeconds, port, batchIndex }) => {
  const startedAt = Date.now();
  let browser;
  let page;
  let monitor;
  try {
    browser = await puppeteer.getBrowserInstance(port);
    page = await browser.newPage();
    monitor = attachPageMonitor(page, browser.rawBrowser || browser);
    await page.setBypassCSP(true);
    page.setDefaultTimeout(PAGE_DEFAULT_TIMEOUT * 1000);
    await blockHeavyResources(page);

    await page.setViewport({
      width: 640,
      height: 480,
      deviceScaleFactor: 1,
    });
    const ipAddr = await getCurrentIPSafe(page);
    const targetUrlsForAction = _take(_shuffle(targetUrls), VIEW_ACTION_COUNT);
    const results = await watchVideosInSequence(page, ipAddr, targetUrlsForAction, durationInSeconds, monitor);

    const crashed = monitor.crashed || monitor.disconnected;
    if (crashed) {
      await captureCrashArtifacts({ page, monitor, port, batchIndex, reason: 'browser-crash-detected' });
    }
    try {
      await page.close();
    } catch {
      // page may already be gone
    }

    return {
      port,
      status: crashed ? 'crashed' : 'completed',
      errorType: crashed ? ERROR_TYPES.BROWSER_CRASH : null,
      counts: tallyStatuses(results),
      results,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const errorType = classifyError(error, monitor);
    logger.warn(`View action on port ${port} failed. Reason: ${errorType}`);
    logger.debug(error);
    if (page) {
      await captureCrashArtifacts({ page, monitor, port, batchIndex, reason: errorType }).catch(() => {});
    }
    return {
      port,
      status: 'failed',
      errorType,
      counts: {},
      results: [],
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};

module.exports = { getCurrentIP, viewVideosInBatch };

const _each = require('lodash/each');

const TorService = require('../services/tor.service');
const YTBrowserService = require('../services/youtubeBrowser.service');
const browserPool = require('../services/browserPool.service');
const { logger, resourceMonitor, errorTypes } = require('../utils');

let successes = 0;
let failures = 0;
let total = 0;
const errorTotals = {};

const addToErrorTotals = (type, count = 1) => {
  if (!type) return;
  errorTotals[type] = (errorTotals[type] || 0) + count;
};

const startViewingHandler = async (options, index) => {
  await TorService.startTor();
  const ports = [];
  for (let i = 0; i < options.batchCount; i += 1) ports.push(options.startPort + i);
  await browserPool.ensureBrowsers(ports);
  const promiseArr = [];
  for (let i = 0; i < options.batchCount; i += 1) {
    const port = options.startPort + i;
    const batchIndex = index * options.batchCount + i;
    promiseArr.push(YTBrowserService.viewVideosInBatch({
      ...options, port, batchIndex, browser: browserPool.getBrowser(port),
    }));
  }
  return Promise.allSettled(promiseArr).then((settedPromises) => {
    logger.info('Batch Summary -');
    _each(settedPromises, (settled, i) => {
      const viewNumber = index * options.batchCount + i + 1;
      total += 1;
      if (settled.status === 'fulfilled') {
        successes += 1;
        const result = settled.value || {};
        logger.info(`View ${viewNumber} - ${result.status || 'completed'}`);
        _each(result.counts, (count, type) => addToErrorTotals(type, count));
        if (result.errorType) addToErrorTotals(result.errorType);
      } else {
        failures += 1;
        addToErrorTotals(errorTypes.ERROR_TYPES.UNKNOWN_ERROR);
        logger.info(`View ${viewNumber} - rejected`);
        logger.debug(settled.reason);
      }
      logger.info(`Fulfilled - ${successes}\t Failed - ${failures}\t Total - ${total}`);
    });
    logger.info('Result Breakdown -');
    _each(errorTotals, (count, type) => logger.info(`${type}: ${count}`));
    logger.info(`Resources - ${resourceMonitor.getSnapshot()}`);
  });
};

module.exports = startViewingHandler;

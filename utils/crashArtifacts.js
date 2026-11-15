const fs = require('fs');
const path = require('path');

const logger = require('./logger');
const { CRASH_ARTIFACTS_DIR } = require('./constants');

const safeCall = async (fn, fallback) => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

const captureCrashArtifacts = async ({ page, monitor, port, batchIndex, reason }) => {
  const dir = path.resolve(process.cwd(), CRASH_ARTIFACTS_DIR);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    logger.debug(`Failed to create crash artifacts directory: ${error}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = batchIndex !== undefined ? `-batch${batchIndex}` : '';
  const baseName = `crash-${stamp}-port${port}${suffix}`;

  const artifacts = {
    capturedAt: new Date().toISOString(),
    reason,
    port,
    batchIndex: batchIndex !== undefined ? batchIndex : null,
    url: await safeCall(() => page.url(), null),
    title: await safeCall(() => page.title(), null),
    crashError: monitor ? monitor.crashError : null,
    browserDisconnected: monitor ? monitor.disconnected : false,
    pageErrors: monitor ? monitor.pageErrors : [],
    networkFailures: monitor ? monitor.networkFailures : [],
  };

  try {
    const screenshotPath = path.join(dir, `${baseName}.png`);
    await page.screenshot({ path: screenshotPath });
    artifacts.screenshot = path.basename(screenshotPath);
  } catch (error) {
    artifacts.screenshotError = String((error && error.message) || error);
  }

  try {
    const jsonPath = path.join(dir, `${baseName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(artifacts, null, 2));
    artifacts.artifactFile = path.basename(jsonPath);
  } catch (error) {
    logger.debug(`Failed to write crash artifact json: ${error}`);
  }

  logger.warn(`Crash artifacts captured for port ${port} in ${CRASH_ARTIFACTS_DIR}/`);
  return artifacts;
};

module.exports = { captureCrashArtifacts };

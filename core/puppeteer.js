const puppeteer = require('puppeteer-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
const { IS_PROD } = require('../utils/constants');

puppeteer.use(stealthPlugin());

// In order to run chromium processes in parallel. https://github.com/puppeteer/puppeteer/issues/594#issuecomment-325919885
process.setMaxListeners(Infinity);

// Flags that reduce Chromium's memory footprint. Each browser instance runs a
// single page, so multi-process isolation and background services are wasted RAM.
const MEMORY_SAVING_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--mute-audio',
  '--disable-site-isolation-trials',
  '--renderer-process-limit=1',
  '--disk-cache-size=1',
  '--aggressive-cache-discard',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--force-device-scale-factor=1',
  '--disable-features=Translate,BackForwardCache,MediaRouter,PaintHolding,WebContentsOcclusion',
];

const launchBrowser = async (port) => {
  const args = ['--no-sandbox', ...MEMORY_SAVING_ARGS];
  if (IS_PROD) args.push(`--proxy-server=socks5://127.0.0.1:${port}`);
  return puppeteer.launch({
    args,
    devtools: !IS_PROD,
    executablePath: IS_PROD ? '/usr/bin/chromium-browser' : undefined,
  });
};

module.exports = {
  launchBrowser,
  MEMORY_SAVING_ARGS,
};

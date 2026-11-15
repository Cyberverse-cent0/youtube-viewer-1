const { ERROR_TYPES } = require('../utils/errorTypes');

const GOOGLE_HOST_PATTERN = /(^|\.)google\.com$/;
const YOUTUBE_HOST_PATTERN = /(^|\.)youtube\.com$/;

const getHostname = (url) => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const getPageSignals = (page) => page.evaluate(() => {
  const body = document.body;
  const rawText = body && body.innerText ? String(body.innerText) : '';
  const title = document.title ? String(document.title) : '';
  return {
    text: rawText.slice(0, 50000).toLowerCase(),
    title: title.toLowerCase(),
    hasEnforcementMessage: !!document.querySelector('ytd-enforcement-message-view-model'),
    hasGoogleSorryForm: !!document.querySelector('form[action*="/sorry"]'),
  };
});

const detectChallenge = async (page) => {
  let currentUrl = '';
  try {
    currentUrl = page.url();
  } catch {
    return null;
  }
  if (!currentUrl) return null;

  if (/google\.com\/sorry/i.test(currentUrl)) return ERROR_TYPES.GOOGLE_CHALLENGE;
  if (/consent\.youtube\.com/i.test(currentUrl)) return ERROR_TYPES.YOUTUBE_CHALLENGE;
  if (/consent\.google\.com/i.test(currentUrl)) return ERROR_TYPES.GOOGLE_CHALLENGE;
  if (/youtube\.com\/verify_age/i.test(currentUrl)) return ERROR_TYPES.YOUTUBE_CHALLENGE;

  let signals;
  try {
    signals = await getPageSignals(page);
  } catch {
    return null;
  }
  if (!signals) return null;

  const hostname = getHostname(currentUrl);
  const isGoogle = GOOGLE_HOST_PATTERN.test(hostname);
  const isYoutube = YOUTUBE_HOST_PATTERN.test(hostname);

  if (isGoogle || signals.hasGoogleSorryForm) {
    const googleSignals = [
      'unusual traffic',
      'not a robot',
      'our systems have detected',
    ];
    if (signals.hasGoogleSorryForm ||
        googleSignals.some((signal) => signals.text.indexOf(signal) !== -1 || signals.title.indexOf(signal) !== -1)) {
      return ERROR_TYPES.GOOGLE_CHALLENGE;
    }
  }

  if (isYoutube || signals.hasEnforcementMessage) {
    const youtubeSignals = [
      'confirm you’re not a bot',
      'confirm you\'re not a bot',
      'sign in to confirm',
      'before you continue to youtube',
      'your browser or connection has been flagged',
    ];
    if (signals.hasEnforcementMessage ||
        youtubeSignals.some((signal) => signals.text.indexOf(signal) !== -1 || signals.title.indexOf(signal) !== -1)) {
      return ERROR_TYPES.YOUTUBE_CHALLENGE;
    }
  }

  return null;
};

const getPlaybackState = (page) => page.evaluate(() => {
  const video = document.querySelector('video');
  if (!video) return { found: false };
  return {
    found: true,
    paused: !!video.paused,
    ended: !!video.ended,
    currentTime: video.currentTime,
    readyState: video.readyState,
    errorCode: video.error ? video.error.code : null,
  };
});

const ensurePlaybackStarted = async (page) => {
  let state = await getPlaybackState(page);
  if (!state.found || state.errorCode !== null) return state;
  if (!state.paused) return state;

  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video && video.paused) {
      try {
        const playPromise = video.play();
        if (playPromise && playPromise.catch) playPromise.catch(() => {});
      } catch {
        // autoplay policy may reject play(); verified after the watch duration
      }
    }
  });
  await page.waitFor(1000);
  state = await getPlaybackState(page);
  if (!state.found || state.errorCode !== null || !state.paused) return state;

  try {
    const player = await page.$('.html5-video-player');
    const box = player ? await player.boundingBox() : null;
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitFor(1000);
      state = await getPlaybackState(page);
    }
  } catch {
    // page may be mid-navigation; final verification happens after the watch duration
  }
  return state;
};

module.exports = {
  detectChallenge,
  getPlaybackState,
  ensurePlaybackStarted,
};

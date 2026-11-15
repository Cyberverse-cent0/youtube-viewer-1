/* eslint-disable no-restricted-syntax */
const _random = require('lodash/random');

const { ERROR_TYPES, classifyError, isChallengeType, toErrorMessage } = require('../utils/errorTypes');
const { detectChallenge, getPlaybackState, ensurePlaybackStarted } = require('./pageState');
const { logger } = require('../utils');

const VIEW_COUNT_SELECTOR_TIMEOUT = 5000;

const describePlaybackState = (state) => {
  if (!state.found) return 'no-video-element';
  if (state.errorCode !== null && state.errorCode !== undefined) return `media-error-${state.errorCode}`;
  if (state.paused) return 'video-paused';
  if (!state.currentTime) return 'no-playback-progress';
  return null;
};

const watchSingleVideo = async (page, ipAddr, url, durationInSeconds, monitor) => {
  try {
    await page.goto(url, { waitUntil: 'load' });
  } catch (error) {
    const status = classifyError(error, monitor);
    logger.logClassifiedFailure(url, ipAddr, status, toErrorMessage(error));
    return { url, status, detail: toErrorMessage(error) };
  }

  let challenge = null;
  try {
    challenge = await detectChallenge(page);
  } catch (error) {
    logger.debug(`Challenge detection failed for ${url}: ${toErrorMessage(error)}`);
  }
  if (challenge) {
    let landedUrl = url;
    try {
      landedUrl = page.url();
    } catch {
      // page may already be gone
    }
    logger.logClassifiedFailure(url, ipAddr, challenge, landedUrl);
    return { url, status: challenge, detail: landedUrl };
  }

  try {
    await page.waitForSelector('.view-count', { timeout: VIEW_COUNT_SELECTOR_TIMEOUT });
  } catch {
    const lateChallenge = await detectChallenge(page).catch(() => null);
    const status = lateChallenge || ERROR_TYPES.PLAYBACK_ERROR;
    logger.logClassifiedFailure(url, ipAddr, status, 'view-count-timeout');
    return { url, status, detail: 'view-count-timeout' };
  }

  try {
    await ensurePlaybackStarted(page);
    const duration = (durationInSeconds + _random(-(durationInSeconds / 6), (durationInSeconds / 6), true));
    await page.waitFor(duration * 1000);
    const playbackState = await getPlaybackState(page);
    const playbackIssue = describePlaybackState(playbackState);
    if (playbackIssue) {
      logger.logClassifiedFailure(url, ipAddr, ERROR_TYPES.PLAYBACK_ERROR, playbackIssue);
      return { url, status: ERROR_TYPES.PLAYBACK_ERROR, detail: playbackIssue };
    }
    const countLogged = await logger.logCount(page, url, ipAddr, duration);
    if (!countLogged) {
      logger.logClassifiedFailure(url, ipAddr, ERROR_TYPES.PLAYBACK_ERROR, 'view-count-read-failed');
      return { url, status: ERROR_TYPES.PLAYBACK_ERROR, detail: 'view-count-read-failed' };
    }
    return { url, status: ERROR_TYPES.SUCCESS, duration };
  } catch (error) {
    const status = classifyError(error, monitor);
    logger.logClassifiedFailure(url, ipAddr, status, toErrorMessage(error));
    return { url, status, detail: toErrorMessage(error) };
  }
};

const watchVideosInSequence = async (page, ipAddr, targetUrlsList, durationInSeconds, monitor) => {
  const results = [];
  for (const url of targetUrlsList) {
    if (monitor && (monitor.crashed || monitor.disconnected)) break;
    const result = await watchSingleVideo(page, ipAddr, url, durationInSeconds, monitor);
    results.push(result);
    if (isChallengeType(result.status)) break;
  }
  return results;
};

module.exports = { watchVideosInSequence };

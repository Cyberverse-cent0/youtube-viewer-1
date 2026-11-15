const ERROR_TYPES = {
  SUCCESS: 'SUCCESS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  BROWSER_CRASH: 'BROWSER_CRASH',
  GOOGLE_CHALLENGE: 'GOOGLE_CHALLENGE',
  YOUTUBE_CHALLENGE: 'YOUTUBE_CHALLENGE',
  PLAYBACK_ERROR: 'PLAYBACK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

const CHALLENGE_TYPES = [ERROR_TYPES.GOOGLE_CHALLENGE, ERROR_TYPES.YOUTUBE_CHALLENGE];

const isChallengeType = (type) => CHALLENGE_TYPES.indexOf(type) !== -1;

const toErrorMessage = (error) => String((error && (error.message || error.stack)) || error || '');

const classifyError = (error, monitor) => {
  const monitorState = monitor || {};
  if (monitorState.crashed || monitorState.disconnected) return ERROR_TYPES.BROWSER_CRASH;
  const message = toErrorMessage(error);
  if (/target closed|session closed|has been closed|disconnected|crash/i.test(message)) {
    return ERROR_TYPES.BROWSER_CRASH;
  }
  if (/net::ERR_|ERR_TUNNEL|ERR_PROXY|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ESOCKETTIMEDOUT|socket hang up|timed? ?out/i.test(message)) {
    return ERROR_TYPES.NETWORK_ERROR;
  }
  return ERROR_TYPES.UNKNOWN_ERROR;
};

module.exports = {
  ERROR_TYPES,
  CHALLENGE_TYPES,
  isChallengeType,
  classifyError,
  toErrorMessage,
};

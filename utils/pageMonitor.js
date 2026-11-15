const MAX_ENTRIES = 50;

const truncate = (value, max = 500) => {
  const str = String(value);
  return str.length > max ? `${str.slice(0, max)}...` : str;
};

const toErrorMessage = (error) => String((error && (error.message || error.stack)) || error || '');

const safePageUrl = (page) => {
  try {
    return page.url();
  } catch {
    return null;
  }
};

const pushBounded = (arr, entry) => {
  if (arr.length < MAX_ENTRIES) arr.push(entry);
};

const attachPageMonitor = (page, browser) => {
  const state = {
    crashed: false,
    crashError: null,
    disconnected: false,
    pageErrors: [],
    networkFailures: [],
  };

  page.on('error', (error) => {
    state.crashed = true;
    state.crashError = {
      message: truncate(toErrorMessage(error)),
      at: new Date().toISOString(),
    };
  });

  page.on('pageerror', (error) => {
    pushBounded(state.pageErrors, {
      source: 'pageerror',
      message: truncate(toErrorMessage(error)),
      stack: truncate(error && error.stack ? error.stack : '', 1000),
      url: safePageUrl(page),
      at: new Date().toISOString(),
    });
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    pushBounded(state.pageErrors, {
      source: 'console',
      message: truncate(msg.text()),
      url: safePageUrl(page),
      at: new Date().toISOString(),
    });
  });

  page.on('requestfailed', (request) => {
    let errorText = '';
    try {
      const failure = request.failure();
      errorText = failure ? failure.errorText : '';
    } catch {
      // request may already be gone
    }
    pushBounded(state.networkFailures, {
      url: truncate(request.url(), 300),
      errorText,
      at: new Date().toISOString(),
    });
  });

  if (browser && typeof browser.on === 'function') {
    browser.on('disconnected', () => {
      state.disconnected = true;
    });
  }

  return state;
};

module.exports = { attachPageMonitor };

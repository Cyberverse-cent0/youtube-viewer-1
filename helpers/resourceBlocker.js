const BLOCKED_RESOURCE_TYPES = ['image', 'font'];

const blockHeavyResources = async (page) => {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (BLOCKED_RESOURCE_TYPES.indexOf(request.resourceType()) !== -1) {
      request.abort();
    } else {
      request.continue();
    }
  });
};

module.exports = { blockHeavyResources };

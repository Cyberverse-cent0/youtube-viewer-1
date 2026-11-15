const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const logger = require('./logger');
const { RESOURCE_MONITOR_INTERVAL_MS } = require('./constants');

const PID_PATTERN = /^\d+$/;
const CHROMIUM_BINARY_PATTERN = /chrom/i;
const CHROMIUM_LAUNCH_PATTERN = /chromium|\.local-chromium|--no-sandbox/i;

const getClkTck = () => {
  try {
    const value = parseInt(execSync('getconf CLK_TCK', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 10);
    return value > 0 ? value : 100;
  } catch {
    return 100;
  }
};

const CLK_TCK = getClkTck();

const isChromiumProcess = (cmdline) => (
  CHROMIUM_BINARY_PATTERN.test(cmdline) && CHROMIUM_LAUNCH_PATTERN.test(cmdline)
);

const scanChromiumProcesses = () => {
  const stats = { processCount: 0, rssKb: 0, cpuJiffies: 0 };
  let entries;
  try {
    entries = fs.readdirSync('/proc');
  } catch {
    return stats;
  }
  for (const entry of entries) {
    if (!PID_PATTERN.test(entry)) continue;
    const pidDir = `/proc/${entry}`;
    let cmdline = '';
    try {
      cmdline = fs.readFileSync(`${pidDir}/cmdline`, 'utf8');
    } catch {
      continue;
    }
    if (!isChromiumProcess(cmdline)) continue;
    stats.processCount += 1;
    try {
      const status = fs.readFileSync(`${pidDir}/status`, 'utf8');
      const rssMatch = /VmRSS:\s*(\d+)\s*kB/.exec(status);
      if (rssMatch) stats.rssKb += parseInt(rssMatch[1], 10);
    } catch {
      // process may have exited
    }
    try {
      const stat = fs.readFileSync(`${pidDir}/stat`, 'utf8');
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
      const utime = parseInt(fields[11], 10);
      const stime = parseInt(fields[12], 10);
      if (!Number.isNaN(utime)) stats.cpuJiffies += utime;
      if (!Number.isNaN(stime)) stats.cpuJiffies += stime;
    } catch {
      // process may have exited
    }
  }
  return stats;
};

const state = {
  intervalId: null,
  lastSampleAt: null,
  lastCpuJiffies: null,
  latest: null,
};

const sample = () => {
  const now = Date.now();
  const stats = scanChromiumProcesses();
  const nodeRssMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  let cpuPercent = null;
  if (state.lastSampleAt !== null && state.lastCpuJiffies !== null) {
    const elapsedSeconds = (now - state.lastSampleAt) / 1000;
    const deltaJiffies = stats.cpuJiffies - state.lastCpuJiffies;
    if (elapsedSeconds > 0) {
      cpuPercent = Math.round(((deltaJiffies / CLK_TCK) / elapsedSeconds) * 1000) / 10;
    }
  }
  state.lastSampleAt = now;
  state.lastCpuJiffies = stats.cpuJiffies;
  state.latest = {
    hostname: os.hostname(),
    chromiumProcesses: stats.processCount,
    chromiumRssMb: Math.round(stats.rssKb / 1024),
    chromiumCpuPercent: cpuPercent,
    nodeRssMb,
    sampledAt: new Date(now).toISOString(),
  };
  return state.latest;
};

const formatSnapshot = (snap) => {
  const cpu = snap.chromiumCpuPercent === null ? 'n/a' : `${snap.chromiumCpuPercent}%`;
  return `container=${snap.hostname} chromium_processes=${snap.chromiumProcesses} ` +
    `chromium_rss_mb=${snap.chromiumRssMb} chromium_cpu=${cpu} node_rss_mb=${snap.nodeRssMb}`;
};

const start = () => {
  if (state.intervalId) return;
  sample();
  state.intervalId = setInterval(() => {
    logger.info(`RESOURCE ${formatSnapshot(sample())}`);
  }, RESOURCE_MONITOR_INTERVAL_MS);
};

const stop = () => {
  if (state.intervalId) clearInterval(state.intervalId);
  state.intervalId = null;
};

const getSnapshot = () => formatSnapshot(sample());

module.exports = { start, stop, getSnapshot };

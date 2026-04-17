const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes in ms
const DATA_FILE = 'lover_browsing_data.json';
const OUTPUT_FILENAME = 'lover-data/browsing.json'; // 注意：Chrome 无法自动创建子目录
const ALARM_NAME = 'auto-sync';

let browsingCache = {
  records: [],
  last_sync: null
};

chrome.runtime.onInstalled.addListener(() => {
  loadCache().then(() => {
    console.log('[Lover Skill] Extension installed, cache loaded, records:', browsingCache.records.length);
  });
  // 创建定时闹钟（alarms 在浏览器重启后依然有效，setInterval 会失效）
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 15 });
});

// 浏览器启动时（service worker 首次启动）：尝试从 Downloads 文件恢复数据
chrome.runtime.onStartup.addListener(() => {
  console.log('[Lover Skill] Service worker starting up after browser launch');
  // loadCache() 内部会在 storage 为空时触发恢复
  loadCache().then(() => {
    console.log('[Lover Skill] Loaded cache, records:', browsingCache.records.length);
  });
});

// 使用 Chrome Downloads API 读取上次下载的文件来恢复数据（异步，不阻塞）
async function recoverFromDownloads() {
  try {
    // 查找最近一次下载的 lover-data/browsing.json
    const results = await new Promise(resolve => {
      chrome.downloads.search({
        filename: 'lover-data/browsing.json',
        limit: 5
      }, resolve);
    });
    if (!results || results.length === 0) return;

    // 按时间倒序，取最新的一个有实际内容的文件
    const candidates = results
      .filter(r => r.filePath && r.bytesReceived > 200) // 过滤掉62字节的空文件
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
    if (candidates.length === 0) return;

    const latest = candidates[0];
    console.log('[Lover Skill] 尝试从文件恢复:', latest.filePath, latest.bytesReceived, 'bytes');

    // 读取文件内容（Chrome 扩展可以通过 file:// 访问下载目录的文件）
    const response = await fetch(`file://${latest.filePath}`);
    if (!response.ok) return;
    const text = await response.text();
    const data = JSON.parse(text);
    if (data.records && data.records.length > 0) {
      browsingCache = data;
      await chrome.storage.local.set({ [DATA_FILE]: JSON.stringify(browsingCache) });
      console.log('[Lover Skill] ✅ 已从 Downloads 恢复', browsingCache.records.length, '条浏览记录');
    }
  } catch (e) {
    console.log('[Lover Skill] 从 Downloads 恢复失败:', e.message);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[Lover Skill] 闹钟触发，开始同步...');
    syncToLocalFile();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    recordVisit(tab.url, tab.title, tabId);
  }
});

function recordVisit(url, title, tabId) {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return;
  }

  // 检查是否已存在该URL记录，存在则更新时间，不重复添加
  const existingIndex = browsingCache.records.findIndex(r => r.url === url);
  const domain = extractDomain(url);

  if (existingIndex !== -1) {
    // 更新现有记录
    browsingCache.records[existingIndex].timestamp = new Date().toISOString();
    browsingCache.records[existingIndex].title = title || browsingCache.records[existingIndex].title;
  } else {
    // 新增记录
    const record = {
      url,
      title: title || '',
      domain,
      timestamp: new Date().toISOString(),
      duration: 0,
      maxScrollDepth: 0,
      tabId,
      visitCount: 1
    };
    browsingCache.records.push(record);
  }

  if (browsingCache.records.length % 10 === 0) {
    saveCache();
  }
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch (e) {
    return url;
  }
}

async function loadCache() {
  return new Promise(resolve => {
    chrome.storage.local.get([DATA_FILE], async (result) => {
      if (result[DATA_FILE]) {
        try {
          browsingCache = JSON.parse(result[DATA_FILE]);
        } catch (e) {
          browsingCache = { records: [], last_sync: null };
        }
      }
      // storage 为空时（浏览器重启后），从 Downloads 文件恢复
      if (browsingCache.records.length === 0) {
        await recoverFromDownloads();
      }
      resolve();
    });
  });
}

function saveCache() {
  browsingCache.last_sync = new Date().toISOString();
  chrome.storage.local.set({
    [DATA_FILE]: JSON.stringify(browsingCache)
  });
}

async function syncToLocalFile() {
  // 关键保护：如果缓存为空（浏览器刚重启），不下载文件，避免覆盖真实数据
  // 等待用户开始浏览后，真实数据会重新积累，届时再同步
  if (browsingCache.records.length === 0) {
    console.log('[Lover Skill] 缓存为空，跳过文件同步（等待数据积累）');
    return;
  }

  browsingCache.last_sync = new Date().toISOString();
  await chrome.storage.local.set({
    [DATA_FILE]: JSON.stringify(browsingCache)
  });

  // 注意：chrome.downloads.remove 只会清除下载历史，并不会删除实际文件；
  // 正确的去重方式是下载时显式指定 conflictAction: 'overwrite'，让 Chrome 覆盖同名文件。
  const jsonStr = JSON.stringify(browsingCache, null, 2);
  const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(jsonStr)));

  chrome.downloads.download({
    url: dataUrl,
    filename: OUTPUT_FILENAME,
    saveAs: false,
    conflictAction: 'overwrite'
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.log('[Lover Skill] 自动同步失败:', chrome.runtime.lastError.message);
      // 备用方案：下载到 Downloads 根目录
      chrome.downloads.download({
        url: dataUrl,
        filename: 'browsing.json',
        saveAs: false,
        conflictAction: 'overwrite'
      }, (backupId) => {
        if (chrome.runtime.lastError) {
          console.log('[Lover Skill] 备用同步也失败:', chrome.runtime.lastError.message);
        } else {
          console.log('[Lover Skill] 数据已同步到 Downloads/browsing.json (备用路径)');
        }
      });
    } else {
      console.log('[Lover Skill] 数据已同步到 Downloads/lover-data/browsing.json, id:', downloadId);
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'getData') {
    sendResponse(browsingCache);
  } else if (message.type === 'syncNow') {
    syncToLocalFile().then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.type === 'getStats') {
    sendResponse({
      recordCount: browsingCache.records.length,
      lastSync: browsingCache.last_sync
    });
  } else if (message.type === 'pageEngagement') {
    // 更新记录的时长和滑动深度
    const { url, duration, maxScrollDepth } = message.data;
    const record = browsingCache.records.find(r => r.url === url);
    if (record) {
      record.duration = (record.duration || 0) + duration;
      record.maxScrollDepth = Math.max(record.maxScrollDepth || 0, maxScrollDepth || 0);
      record.visitCount = (record.visitCount || 1) + 1;
    }
  }
});

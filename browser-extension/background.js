const SYNC_INTERVAL = 10 * 60 * 1000; // 10 minutes in ms
const DATA_FILE = 'lover_browsing_data.json';
const OUTPUT_FILENAME = 'lover-data/browsing.json'; // 注意：Chrome 无法自动创建子目录

let browsingCache = {
  records: [],
  last_sync: null
};

chrome.runtime.onInstalled.addListener(() => {
  loadCache();
  console.log('[Lover Skill] Extension installed, cache loaded');
});

setInterval(syncToLocalFile, SYNC_INTERVAL);

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

function loadCache() {
  chrome.storage.local.get([DATA_FILE], (result) => {
    if (result[DATA_FILE]) {
      try {
        browsingCache = JSON.parse(result[DATA_FILE]);
      } catch (e) {
        browsingCache = { records: [], last_sync: null };
      }
    }
  });
}

function saveCache() {
  browsingCache.last_sync = new Date().toISOString();
  chrome.storage.local.set({
    [DATA_FILE]: JSON.stringify(browsingCache)
  });
}

async function syncToLocalFile() {
  browsingCache.last_sync = new Date().toISOString();
  await chrome.storage.local.set({
    [DATA_FILE]: JSON.stringify(browsingCache)
  });

  // 删除已有的 browsing.json 文件（避免 Chrome 自动加 (1) 后缀）
  chrome.downloads.search({ filename: OUTPUT_FILENAME }, (results) => {
    if (results && results.length > 0) {
      chrome.downloads.remove(results.map(r => r.id), () => {
        console.log('[Lover Skill] 已删除旧文件');
      });
    }
  });

  // 下载到 Downloads/lover-data/browsing.json
  // 注意：如果 lover-data 目录不存在，Chrome 会下载失败
  // 解决方案：先尝试下载，如果失败则改用备用路径
  const jsonStr = JSON.stringify(browsingCache, null, 2);
  const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(jsonStr)));

  chrome.downloads.download({
    url: dataUrl,
    filename: OUTPUT_FILENAME,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.log('[Lover Skill] 自动同步失败:', chrome.runtime.lastError.message);
      // 备用方案：下载到根目录
      chrome.downloads.download({
        url: dataUrl,
        filename: 'browsing.json',
        saveAs: false
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

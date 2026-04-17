const fs = require('fs');
const path = require('path');
const browsingAnalyzer = require('./browsing-analyzer');
const db = require('./db-manager');

const HOME = process.env.HOME || process.env.USERPROFILE;
const BROWSING_FILE_PATH = path.join(HOME, 'lover-data', 'browsing.json');
// Chrome 无法覆盖同名文件，会自动加 (1)(2) 后缀，所以扫描目录里所有 browsing*.json
const DOWNLOADS_BROWSING_DIRS = [
  path.join(HOME, 'Downloads', 'lover-data'),
  path.join(HOME, 'Downloads', 'lover-data', 'lover-data') // 扩展偶尔嵌套一层
];
const LOCAL_BROWSING_DIR = path.dirname(BROWSING_FILE_PATH);

// 扫描目录里所有可能的 browsing*.json 文件
function listBrowsingFiles(dir) {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => /^browsing.*\.json$/i.test(f) && !f.startsWith('~$'))
      .map(f => path.join(dir, f));
  } catch (e) {
    return [];
  }
}

// 合并多个 browsing 文件的 records，按 URL 去重，保留 timestamp 最新、duration/visitCount 累加
function mergeBrowsingData(sources) {
  const urlMap = new Map();
  let latestSync = null;
  let fileCount = 0;
  let totalRaw = 0;

  for (const src of sources) {
    let data;
    try {
      const content = fs.readFileSync(src, 'utf8');
      if (!content || content.length < 10) continue;
      data = JSON.parse(content);
    } catch (e) {
      continue;
    }
    if (!data || !Array.isArray(data.records)) continue;
    fileCount++;
    totalRaw += data.records.length;

    for (const rec of data.records) {
      if (!rec || !rec.url) continue;
      const existing = urlMap.get(rec.url);
      if (!existing) {
        urlMap.set(rec.url, { ...rec });
        continue;
      }
      const existingTs = new Date(existing.timestamp || 0).getTime();
      const newTs = new Date(rec.timestamp || 0).getTime();
      if (newTs > existingTs) {
        existing.timestamp = rec.timestamp;
        existing.title = rec.title || existing.title;
      }
      existing.duration = Math.max(existing.duration || 0, rec.duration || 0);
      existing.maxScrollDepth = Math.max(existing.maxScrollDepth || 0, rec.maxScrollDepth || 0);
      existing.visitCount = Math.max(existing.visitCount || 1, rec.visitCount || 1);
    }

    if (data.last_sync) {
      const t = new Date(data.last_sync).getTime();
      if (!latestSync || t > latestSync) latestSync = t;
    }
  }

  const records = Array.from(urlMap.values())
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  return {
    records,
    last_sync: latestSync ? new Date(latestSync).toISOString() : null,
    _meta: {
      sourceFileCount: fileCount,
      rawRecordCount: totalRaw,
      dedupedRecordCount: records.length
    }
  };
}

function writeMergedBackup(payload) {
  try {
    if (!fs.existsSync(LOCAL_BROWSING_DIR)) {
      fs.mkdirSync(LOCAL_BROWSING_DIR, { recursive: true });
    }
    const historyDir = path.join(LOCAL_BROWSING_DIR, 'history');
    if (!fs.existsSync(historyDir)) {
      fs.mkdirSync(historyDir, { recursive: true });
    }

    // 仅在合并结果更"丰富"时写入（避免反复覆盖）
    let shouldWrite = true;
    try {
      if (fs.existsSync(BROWSING_FILE_PATH)) {
        const cur = JSON.parse(fs.readFileSync(BROWSING_FILE_PATH, 'utf8'));
        const curLen = (cur.records || []).length;
        const curSync = new Date(cur.last_sync || 0).getTime();
        const newSync = new Date(payload.last_sync || 0).getTime();
        if (curLen >= payload.records.length && curSync >= newSync) {
          shouldWrite = false;
        }
      }
    } catch (e) {}

    if (!shouldWrite) return false;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyFile = path.join(historyDir, `browsing_${timestamp}.json`);
    fs.writeFileSync(historyFile, JSON.stringify(payload, null, 2), 'utf8');

    const historyFiles = fs.readdirSync(historyDir)
      .filter(f => f.startsWith('browsing_') && f.endsWith('.json'))
      .sort()
      .reverse();
    historyFiles.slice(10).forEach(f => {
      try { fs.unlinkSync(path.join(historyDir, f)); } catch (e) {}
    });

    fs.writeFileSync(BROWSING_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.log('[DataAggregator] 写入失败:', e.message);
    return false;
  }
}

function loadBrowsingData(filePath = BROWSING_FILE_PATH) {
  // 扫描所有来源：Downloads 目录里的 browsing*.json + 本地 lover-data/browsing.json
  const sources = [];
  for (const dir of DOWNLOADS_BROWSING_DIRS) {
    sources.push(...listBrowsingFiles(dir));
  }
  if (fs.existsSync(filePath)) sources.push(filePath);

  if (sources.length === 0) {
    return { records: [], last_sync: null };
  }

  const merged = mergeBrowsingData(sources);

  if (merged.records.length > 0) {
    const payload = { records: merged.records, last_sync: merged.last_sync };
    const wrote = writeMergedBackup(payload);
    if (wrote) {
      console.log('[DataAggregator] 合并写入:', BROWSING_FILE_PATH,
        '| 源文件', merged._meta.sourceFileCount,
        '| 原始', merged._meta.rawRecordCount,
        '| 去重后', merged._meta.dedupedRecordCount);
    }
    return payload;
  }

  return { records: [], last_sync: null };
}

function aggregateAllData(options = {}) {
  const browsingPath = options.browsingPath || BROWSING_FILE_PATH;
  const browsingData = loadBrowsingData(browsingPath);

  const browsingAnalysis = browsingData.records.length > 0
    ? browsingAnalyzer.analyzeBrowsingData(browsingData)
    : { profile: null, domains: [], lastSync: null };

  const userProfile = db.loadUserProfile();
  const loverProfile = db.loadLoverProfile();

  return {
    browsing: browsingAnalysis,
    userProfile,
    loverProfile,
    stats: db.getStats()
  };
}

function getDataReadiness() {
  const stats = db.getStats();
  const browsingData = loadBrowsingData();

  const conversationReady = stats.totalSessions >= 3;
  const browsingReady = browsingData.records && browsingData.records.length >= 10;
  const profileReady = stats.profileExists;

  return {
    conversationReady,
    browsingReady,
    profileReady,
    canGenerateLover: profileReady,
    stats,
    browsingCount: browsingData.records?.length || 0
  };
}

module.exports = {
  loadBrowsingData,
  mergeBrowsingData,
  listBrowsingFiles,
  aggregateAllData,
  getDataReadiness,
  BROWSING_FILE_PATH,
  DOWNLOADS_BROWSING_DIRS
};
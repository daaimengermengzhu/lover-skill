const fs = require('fs');
const path = require('path');
const browsingAnalyzer = require('./browsing-analyzer');
const db = require('./db-manager');

const BROWSING_FILE_PATH = path.join(process.env.HOME || process.env.USERPROFILE, 'lover-data', 'browsing.json');
// Chrome auto-downloads to Downloads/lover-data/browsing.json
const DOWNLOADS_BROWSING_PATH = path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'lover-data', 'browsing.json');

function loadBrowsingData(filePath = BROWSING_FILE_PATH) {
  // Find best source: prefer Downloads (more recent) or local backup
  let bestSource = null;
  let bestData = null;

  const paths = [DOWNLOADS_BROWSING_PATH, filePath];

  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const data = JSON.parse(content);
        if (!bestData || new Date(data.last_sync) > new Date(bestData.last_sync || 0)) {
          bestData = data;
          bestSource = p;
        }
      }
    } catch (e) {
      // Continue to next path
    }
  }

  if (bestData) {
    // Auto-backup to local folder with version history
    try {
      const localDir = path.dirname(BROWSING_FILE_PATH);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      // Backup current to history
      const historyDir = path.join(localDir, 'history');
      if (!fs.existsSync(historyDir)) {
        fs.mkdirSync(historyDir, { recursive: true });
      }

      // Rotate: keep last 5 backups
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const historyFile = path.join(historyDir, `browsing_${timestamp}.json`);
      fs.writeFileSync(historyFile, JSON.stringify(bestData, null, 2), 'utf8');

      // Clean old backups (keep last 5)
      const historyFiles = fs.readdirSync(historyDir)
        .filter(f => f.startsWith('browsing_') && f.endsWith('.json'))
        .sort()
        .reverse();
      historyFiles.slice(5).forEach(f => {
        fs.unlinkSync(path.join(historyDir, f));
      });

      // Write latest
      fs.writeFileSync(BROWSING_FILE_PATH, JSON.stringify(bestData, null, 2), 'utf8');
      console.log('[DataAggregator] Auto-backed up to:', BROWSING_FILE_PATH);
      console.log('[DataAggregator] History count:', historyFiles.length + 1);
    } catch (e) {
      console.log('[DataAggregator] Backup failed:', e.message);
    }
    console.log('[DataAggregator] Loaded browsing data from:', bestSource);
    return bestData;
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
  aggregateAllData,
  getDataReadiness,
  BROWSING_FILE_PATH
};
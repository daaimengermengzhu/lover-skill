/**
 * auto-backup.js - 后台自动备份与同步脚本
 * 每5分钟检查Downloads中的浏览数据，自动备份到本地并触发人格分析
 */

const fs = require('fs');
const path = require('path');

// 检查两个可能的下载路径（扩展可能嵌套创建目录）
const DOWNLOADS_BROWSING_PATHS = [
  path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'lover-data', 'browsing.json'),
  path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'lover-data', 'lover-data', 'browsing.json')
];
const LOCAL_BROWSING_PATH = path.join(process.env.HOME || process.env.USERPROFILE, 'lover-data', 'browsing.json');
const HISTORY_DIR = path.join(process.env.HOME || process.env.USERPROFILE, 'lover-data', 'history');
const CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 每12小时扫描一次
const ANALYSIS_INTERVAL = 24 * 60 * 60 * 1000; // 每天最多分析一次

let lastSyncTime = null;
let lastAnalysisTime = null;

function findBestDownloadsPath() {
  let best = null;
  let bestTime = null;
  for (const p of DOWNLOADS_BROWSING_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        const t = data.last_sync ? new Date(data.last_sync) : null;
        if (t && (!bestTime || t > bestTime)) {
          bestTime = t;
          best = p;
        }
      }
    } catch (e) {}
  }
  return best;
}

function getLocalLastSync() {
  try {
    if (fs.existsSync(LOCAL_BROWSING_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_BROWSING_PATH, 'utf8'));
      return data.last_sync ? new Date(data.last_sync) : null;
    }
  } catch (e) {}
  return null;
}

function checkAndBackup() {
  try {
    const downloadsPath = findBestDownloadsPath();
    if (!downloadsPath) {
      return false;
    }

    const downloadsData = JSON.parse(fs.readFileSync(downloadsPath, 'utf8'));
    const downloadsSyncTime = downloadsData.last_sync ? new Date(downloadsData.last_sync) : null;

    // 过滤空数据（62字节的空文件）
    if (!downloadsData.records || downloadsData.records.length === 0) {
      return false;
    }

    // 检查是否有新数据
    if (!downloadsSyncTime) return false;
    if (lastSyncTime && downloadsSyncTime.getTime() <= lastSyncTime.getTime()) {
      return false; // 没有新数据
    }

    console.log('[AutoBackup] 发现新数据，记录数:', downloadsData.records.length, '来源:', path.basename(path.dirname(downloadsPath)));

    // 确保目录存在
    const localDir = path.dirname(LOCAL_BROWSING_PATH);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }

    // 保存历史版本
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const historyFile = path.join(HISTORY_DIR, `browsing_${timestamp}.json`);
    fs.writeFileSync(historyFile, JSON.stringify(downloadsData, null, 2), 'utf8');
    console.log('[AutoBackup] 历史备份已保存:', path.basename(historyFile));

    // 清理旧历史（保留10份）
    const historyFiles = fs.readdirSync(HISTORY_DIR)
      .filter(f => f.startsWith('browsing_') && f.endsWith('.json'))
      .sort()
      .reverse();
    historyFiles.slice(10).forEach(f => {
      fs.unlinkSync(path.join(HISTORY_DIR, f));
    });

    // 保存最新
    fs.writeFileSync(LOCAL_BROWSING_PATH, JSON.stringify(downloadsData, null, 2), 'utf8');
    lastSyncTime = downloadsSyncTime;

    console.log('[AutoBackup] 备份完成! 记录数:', downloadsData.records?.length || 0);
    return true;

  } catch (e) {
    console.log('[AutoBackup] 备份失败:', e.message);
    return false;
  }
}

// 触发人格分析（如果有 API key，且距上次分析已超过24小时）
async function triggerAnalysis() {
  const now = Date.now();
  if (lastAnalysisTime && now - lastAnalysisTime < ANALYSIS_INTERVAL) {
    const remaining = Math.round((ANALYSIS_INTERVAL - (now - lastAnalysisTime)) / 3600000);
    console.log(`[AutoBackup] 距上次分析不足24小时，跳过（还剩 ~${remaining} 小时）`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.log('[AutoBackup] 未找到 API key，跳过自动分析（下次 /lover update 时会分析）');
    return;
  }

  try {
    console.log('[AutoBackup] 正在调用人格分析...');
    const analyzer = require('./persona-analyzer');
    const result = await analyzer.analyze();
    if (result.status === 'complete') {
      lastAnalysisTime = now;
      console.log('[AutoBackup] ✅ 人格分析已完成');
    } else if (result.status === 'insufficient_data') {
      console.log('[AutoBackup] 数据不足:', result.message);
    }
  } catch (e) {
    console.log('[AutoBackup] 分析失败:', e.message);
  }
}

// 启动
console.log('[AutoBackup] 自动备份服务已启动，每12小时扫描一次，每天最多分析一次');
lastSyncTime = getLocalLastSync();
console.log('[AutoBackup] 本地最新同步时间:', lastSyncTime || '无');

// 立即检查一次（扫描，但不主动分析）
const hasNew = checkAndBackup();
console.log('[AutoBackup] 扫描完成，下次扫描12小时后');

// 定时扫描
setInterval(() => {
  checkAndBackup();
}, CHECK_INTERVAL);

// 独立分析定时器（每天一次，与扫描独立）
setInterval(() => {
  triggerAnalysis();
}, ANALYSIS_INTERVAL);

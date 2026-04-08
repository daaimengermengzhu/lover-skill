/**
 * auto-backup.js - 后台自动备份脚本
 * 每5分钟检查Downloads中的浏览数据，自动备份到lover-data
 */

const fs = require('fs');
const path = require('path');

const DOWNLOADS_BROWSING_PATH = path.join(process.env.HOME || process.env.USERPROFILE, 'Downloads', 'lover-data', 'browsing.json');
const LOCAL_BROWSING_PATH = path.join(process.env.HOME || process.env.USERPROFILE, 'lover-data', 'browsing.json');
const HISTORY_DIR = path.join(process.env.HOME || process.env.USERPROFILE, 'lover-data', 'history');
const CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟

let lastSyncTime = null;

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
    if (!fs.existsSync(DOWNLOADS_BROWSING_PATH)) {
      return false;
    }

    const downloadsData = JSON.parse(fs.readFileSync(DOWNLOADS_BROWSING_PATH, 'utf8'));
    const downloadsSyncTime = downloadsData.last_sync ? new Date(downloadsData.last_sync) : null;

    // 检查是否有新数据
    if (!downloadsSyncTime) return false;
    if (lastSyncTime && downloadsSyncTime.getTime() <= lastSyncTime.getTime()) {
      return false; // 没有新数据
    }

    console.log('[AutoBackup] 发现新数据，开始备份...');

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
      console.log('[AutoBackup] 删除旧备份:', f);
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

// 启动
console.log('[AutoBackup] 自动备份服务已启动，每5分钟检查一次');
lastSyncTime = getLocalLastSync();
console.log('[AutoBackup] 本地最新同步时间:', lastSyncTime || '无');

// 立即检查一次
checkAndBackup();

// 定时检查
setInterval(checkAndBackup, CHECK_INTERVAL);

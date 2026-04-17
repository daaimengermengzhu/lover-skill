/**
 * auto-backup.js - 后台自动备份与同步脚本
 * 定时检查 Downloads 中的浏览数据，合并到本地并（有 API key 时）触发人格分析。
 * 运行方式：直接 `node scripts/auto-backup.js`（会驻留后台）。
 * 不应被其他模块 require；如果要手动触发一次合并，请用 data-aggregator.loadBrowsingData()。
 */

const fs = require('fs');
const path = require('path');
const dataAggregator = require('./data-aggregator');

const LOCAL_BROWSING_PATH = dataAggregator.BROWSING_FILE_PATH;
const HISTORY_DIR = path.join(path.dirname(LOCAL_BROWSING_PATH), 'history');
const CHECK_INTERVAL = 12 * 60 * 60 * 1000; // 每12小时扫描一次
const ANALYSIS_INTERVAL = 24 * 60 * 60 * 1000; // 每天最多分析一次

let lastSyncTime = null;
let lastAnalysisTime = null;

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
    // 使用 data-aggregator 的合并逻辑：扫描所有 browsing*.json、按 URL 去重
    // loadBrowsingData 内部会自动把合并结果写回 LOCAL_BROWSING_PATH + history
    const before = getLocalLastSync();
    const merged = dataAggregator.loadBrowsingData();

    if (!merged.records || merged.records.length === 0) {
      return false;
    }

    const after = merged.last_sync ? new Date(merged.last_sync) : null;
    const changed = !before || (after && after.getTime() > before.getTime());

    if (changed) {
      console.log('[AutoBackup] 合并完成，去重后记录数:', merged.records.length);
      lastSyncTime = after;
      return true;
    }
    return false;
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

// 仅当作为主脚本直接运行时才启动定时器，避免被别的模块 require 时触发副作用
if (require.main === module) {
  console.log('[AutoBackup] 自动备份服务已启动，每 12 小时扫描一次，每 24 小时最多分析一次');
  lastSyncTime = getLocalLastSync();
  console.log('[AutoBackup] 本地最新同步时间:', lastSyncTime || '无');

  // 立即扫描一次（不主动分析）
  checkAndBackup();
  console.log('[AutoBackup] 扫描完成，下次扫描 12 小时后');

  setInterval(() => { checkAndBackup(); }, CHECK_INTERVAL);
  setInterval(() => { triggerAnalysis(); }, ANALYSIS_INTERVAL);
}

module.exports = { checkAndBackup, triggerAnalysis };

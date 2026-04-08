// popup.js

const syncBtn = document.getElementById('sync-btn');
const showBtn = document.getElementById('show-btn');
const copyBtn = document.getElementById('copy-btn');
const recordCountEl = document.getElementById('record-count');
const lastSyncEl = document.getElementById('last-sync');
const dataDisplayEl = document.getElementById('data-display');

let currentData = null;

// Load current stats
function loadStats() {
  chrome.runtime.sendMessage({ type: 'getStats' }, (response) => {
    if (response) {
      recordCountEl.textContent = response.recordCount || 0;
      lastSyncEl.textContent = response.lastSync
        ? new Date(response.lastSync).toLocaleString('zh-CN')
        : '从未';
    }
  });
}

// Sync button click handler
syncBtn.addEventListener('click', () => {
  syncBtn.disabled = true;
  syncBtn.textContent = '同步中...';

  chrome.runtime.sendMessage({ type: 'syncNow' }, (response) => {
    if (response && response.success) {
      syncBtn.textContent = '同步完成!';
      loadStats();

      setTimeout(() => {
        syncBtn.disabled = false;
        syncBtn.textContent = '同步数据';
      }, 2000);
    } else {
      syncBtn.disabled = false;
      syncBtn.textContent = '同步失败，重试';
    }
  });
});

// Show data button
showBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'getData' }, (response) => {
    if (response && response.records) {
      currentData = response;
      const jsonStr = JSON.stringify(response, null, 2);
      dataDisplayEl.textContent = jsonStr;
      dataDisplayEl.classList.add('visible');
      copyBtn.style.display = 'block';
    } else {
      dataDisplayEl.textContent = '暂无数据';
      dataDisplayEl.classList.add('visible');
    }
  });
});

// Copy button
copyBtn.addEventListener('click', () => {
  if (currentData) {
    const jsonStr = JSON.stringify(currentData, null, 2);
    navigator.clipboard.writeText(jsonStr).then(() => {
      copyBtn.textContent = '已复制!';
      setTimeout(() => {
        copyBtn.textContent = '复制数据';
      }, 1500);
    }).catch(() => {
      copyBtn.textContent = '复制失败';
    });
  }
});

// Load stats on popup open
loadStats();

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const TEST_BROWSING_FILE = path.join(__dirname, 'test_browsing.json');
const TEST_BROWSING_DATA = {
  last_sync: '2026-04-07T12:00:00Z',
  records: [
    { url: 'https://bilibili.com/video/1', title: '游戏', domain: 'bilibili.com', duration: 1800 },
    { url: 'https://bilibili.com/video/2', title: '游戏2', domain: 'bilibili.com', duration: 1800 },
    { url: 'https://zhihu.com/q/1', title: '心理', domain: 'zhihu.com', duration: 600 }
  ]
};

function testLoadBrowsingData() {
  fs.writeFileSync(TEST_BROWSING_FILE, JSON.stringify(TEST_BROWSING_DATA));
  const { loadBrowsingData } = require('../scripts/data-aggregator');
  const data = loadBrowsingData(TEST_BROWSING_FILE);
  assert(data.records.length === 3, 'Should load 3 records');
  assert(data.last_sync === '2026-04-07T12:00:00Z', 'Should preserve last_sync');
}

function testAggregateAllData() {
  fs.writeFileSync(TEST_BROWSING_FILE, JSON.stringify(TEST_BROWSING_DATA));
  const { aggregateAllData } = require('../scripts/data-aggregator');
  const result = aggregateAllData({ browsingPath: TEST_BROWSING_FILE });
  assert(result.browsing !== null, 'Should have browsing data');
  assert(result.browsing.profile.totalRecords === 3, 'Should have 3 browsing records');
  assert(result.browsing.domains.includes('bilibili.com'), 'Should extract domains');
}

testLoadBrowsingData();
testAggregateAllData();
console.log('All data aggregator tests passed');

fs.unlinkSync(TEST_BROWSING_FILE);
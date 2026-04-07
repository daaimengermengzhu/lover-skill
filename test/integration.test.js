// test/integration.test.js
const assert = require('assert');
const path = require('path');
const fs = require('fs');

function testFullDataFlow() {
  // 1. Test data aggregator with mock browsing data
  const aggregator = require('../scripts/data-aggregator');
  const analyzer = require('../scripts/persona-analyzer');
  const generator = require('../scripts/lover-generator');
  const commands = require('../scripts/lover-commands');

  // 2. Create mock browsing data file
  const mockBrowsingPath = path.join(__dirname, 'mock_browsing.json');
  const mockBrowsingData = {
    last_sync: new Date().toISOString(),
    records: [
      { url: 'https://bilibili.com/video/1', title: '游戏', domain: 'bilibili.com', duration: 1800 },
      { url: 'https://bilibili.com/video/2', title: '游戏2', domain: 'bilibili.com', duration: 1800 },
      { url: 'https://bilibili.com/video/3', title: '游戏3', domain: 'bilibili.com', duration: 1800 },
      { url: 'https://zhihu.com/q/1', title: '情感', domain: 'zhihu.com', duration: 600 }
    ]
  };

  fs.writeFileSync(mockBrowsingPath, JSON.stringify(mockBrowsingData));

  // 3. Test data aggregation
  const aggregated = aggregator.aggregateAllData({ browsingPath: mockBrowsingPath });
  assert(aggregated.browsing.profile.totalRecords === 4, 'Should aggregate 4 records');
  assert(aggregated.browsing.domains.includes('bilibili.com'), 'Should extract bilibili');

  // 4. Test browsing analyzer
  const browsingAnalyzer = require('../scripts/browsing-analyzer');
  const analysis = browsingAnalyzer.analyzeBrowsingData(mockBrowsingData);
  assert(analysis.profile.categories.video === 75, 'Should detect 75% video');

  // 5. Test command parsing
  assert(commands.parseCommand('/lover talk').cmd === 'talk', 'Parse talk');
  assert(commands.parseCommand('/lover advice 我不知道怎么追').cmd === 'advice', 'Parse advice');
  assert(commands.detectLoveTopic('我想找个对象') === true, 'Detect love topic');
  assert(commands.detectLoveTopic('今天工作很累') === false, 'Reject unrelated');

  // 6. Cleanup
  fs.unlinkSync(mockBrowsingPath);

  console.log('Full integration test passed!');
}

testFullDataFlow();
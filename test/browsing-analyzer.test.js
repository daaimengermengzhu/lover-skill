const assert = require('assert');

const BROWSING_DATA = {
  last_sync: '2026-04-07T12:00:00Z',
  records: [
    { url: 'https://bilibili.com/video/123', title: '游戏实况', timestamp: '2026-04-07T10:00:00Z', duration: 1800, domain: 'bilibili.com' },
    { url: 'https://www.zhihu.com/question/456', title: '为什么人会单身', timestamp: '2026-04-07T11:00:00Z', duration: 600, domain: 'zhihu.com' },
    { url: 'https://store.steampowered.com/app/789', title: '赛博朋克2077', timestamp: '2026-04-07T14:00:00Z', duration: 3600, domain: 'store.steampowered.com' }
  ]
};

function testDomainExtraction() {
  const { extractDomains } = require('../scripts/browsing-analyzer');
  const domains = extractDomains(BROWSING_DATA.records);
  assert(domains.includes('bilibili.com'), 'Should extract bilibili');
  assert(domains.includes('zhihu.com'), 'Should extract zhihu');
  assert(domains.includes('store.steampowered.com'), 'Should extract steam');
}

function testCategoryClassification() {
  const { classifyWebsite } = require('../scripts/browsing-analyzer');
  assert(classifyWebsite('bilibili.com') === 'video', 'bilibili is video');
  assert(classifyWebsite('zhihu.com') === 'knowledge', 'zhihu is knowledge');
  assert(classifyWebsite('store.steampowered.com') === 'gaming', 'steam is gaming');
}

function testInterestProfile() {
  const { buildInterestProfile } = require('../scripts/browsing-analyzer');
  const profile = buildInterestProfile(BROWSING_DATA.records);
  assert(profile.totalRecords === 3, 'Should count 3 records');
  assert(profile.topDomains.length > 0, 'Should have top domains');
  assert(profile.categories.gaming > 0, 'Should detect gaming interest');
}

testDomainExtraction();
testCategoryClassification();
testInterestProfile();
console.log('All browsing analyzer tests passed');
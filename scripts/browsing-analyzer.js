// scripts/browsing-analyzer.js

// Domain extraction
function extractDomains(records) {
  const domains = new Set();
  records.forEach(r => {
    if (r.domain) domains.add(r.domain);
    else if (r.url) {
      try {
        const u = new URL(r.url);
        domains.add(u.hostname);
      } catch (e) {}
    }
  });
  return Array.from(domains);
}

// 扩展的域名路径模式
const SUBCATEGORY_PATTERNS = {
  // Bilibili
  'bilibili.com': {
    '/video/': 'video_entertainment',
    '/anime/': 'anime',
    '/movie/': 'movie',
    '/tv/': 'tv_show',
    '/study/': 'learning',
    '/game/': 'gaming_content',
    '/live/': 'live_streaming',
    '/music/': 'music',
    '/v/': 'video_general',
    '/search/': 'search',
    '/following/': 'social_following'
  },
  // YouTube
  'youtube.com': {
    '/watch': 'video_entertainment',
    '/playlist': 'video_playlist',
    '/channel/': 'video_channel',
    '/results?search_query': 'search',
    '/shorts/': 'short_video'
  },
  // 知乎
  'zhihu.com': {
    '/question/': 'knowledge_question',
    '/people/': 'social_profile',
    '/topic/': 'knowledge_topic',
    '/search/': 'search',
    '/pin/': 'social_content',
    '/zvideo/': 'video_knowledge'
  },
  // 微博
  'weibo.com': {
    '/u/': 'social_celebrity',
    '/search/': 'search',
    '/status/': 'social_post',
    '/topic/': 'social_topic'
  },
  // GitHub
  'github.com': {
    '/search': 'search',
    '/issues': 'dev_issues',
    '/pulls': 'dev_pulls',
    '/repo/': 'dev_repo',
    '/trending/': 'dev_trending'
  },
  // 京东
  'jd.com': {
    '/item/': 'shopping_product',
    '/search/': 'shopping_search',
    '/cart/': 'shopping_cart'
  },
  // 淘宝
  'taobao.com': {
    '/item/': 'shopping_product',
    '/search/': 'shopping_search'
  },
  // 小红书
  'xiaohongshu.com': {
    '/search/': 'search',
    '/discovery/': 'social_discovery',
    '/user/profile/': 'social_profile'
  },
  // 36kr
  '36kr.com': {
    '/search/': 'search',
    '/newsflashes': 'news_flash',
    '/article/': 'news_article'
  },
  // 虎扑
  'hupu.com': {
    '/search/': 'search',
    '/bbs/': 'sports_community',
    '/video/': 'sports_video'
  }
};

// 主分类模式
const CATEGORY_PATTERNS = {
  video: ['bilibili.com', 'youtube.com', 'douyin.com', 'iqiyi.com', 'tencent.com/video', 'youku.com'],
  knowledge: ['zhihu.com', 'jianshu.com', 'douban.com', 'wikipedia.org', 'wiki', 'baike.baidu.com'],
  gaming: ['store.steampowered.com', 'steamcommunity.com', 'wegame.com', 'epicgames.com', 'gamer.com.tw'],
  social: ['weibo.com', 'xiaohongshu.com', 'twitter.com', 'instagram.com', 'reddit.com', 'weixin.qq.com'],
  shopping: ['taobao.com', 'jd.com', 'pinduoduo.com', 'amazon.cn', 'tmall.com', 'suning.com'],
  news: ['36kr.com', 'ifeng.com', 'thepaper.cn', 'huxiu.com', 'news.sina.com.cn', 'qq.com/news'],
  tech: ['github.com', 'juejin.cn', 'segmentfault.com', 'stackoverflow.com', 'csdn.net', 'iteye.com'],
  novel: ['qidian.com', 'jinjiang.com', 'read78.com', 'penguin.com', 'shubaowen.com'],
  finance: ['xueqiu.com', 'eastmoney.com', '.sina.com.cn/finance', 'tonghuashun.com'],
  sports: ['hupu.com', 'sports.qq.com', 'zhibo8.cc', 'dongqiudi.com']
};

function classifyWebsite(url) {
  let hostname;
  let pathname = '/';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname + parsed.search;
  } catch (e) {
    hostname = url;
  }

  // 首先检查路径模式
  for (const [domain, paths] of Object.entries(SUBCATEGORY_PATTERNS)) {
    if (hostname.includes(domain)) {
      for (const [path, subcat] of Object.entries(paths)) {
        if (pathname.includes(path)) {
          return subcat;
        }
      }
      return 'other';
    }
  }

  // 回退到主分类
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some(p => hostname.includes(p))) {
      return category;
    }
  }
  return 'other';
}

// 子分类到主分类的映射
const SUBCATEGORY_TO_MAIN = {
  video_entertainment: 'video',
  video_playlist: 'video',
  video_channel: 'video',
  video_general: 'video',
  video_knowledge: 'knowledge',
  video_anime: 'anime',
  short_video: 'video',
  pet_content: 'entertainment',
  anime: 'anime',
  movie: 'movie',
  tv_show: 'video',
  music: 'entertainment',
  live_streaming: 'video',
  learning: 'knowledge',
  knowledge_question: 'knowledge',
  knowledge_topic: 'knowledge',
  programming: 'tech',
  language_learning: 'learning',
  gaming_content: 'gaming',
  social_celebrity: 'social',
  social_profile: 'social',
  social_post: 'social',
  social_topic: 'social',
  social_discovery: 'social',
  social_following: 'social',
  shopping_product: 'shopping',
  shopping_search: 'shopping',
  shopping_cart: 'shopping',
  search: 'search',
  dev_issues: 'tech',
  dev_pulls: 'tech',
  dev_repo: 'tech',
  dev_trending: 'tech',
  news_flash: 'news',
  news_article: 'news',
  sports_community: 'sports',
  sports_video: 'sports',
  finance: 'finance'
};

// 构建兴趣画像
function buildInterestProfile(records) {
  const categories = { video: 0, knowledge: 0, gaming: 0, social: 0, shopping: 0, news: 0, tech: 0, novel: 0, finance: 0, sports: 0, anime: 0, movie: 0, other: 0 };
  const subCategories = {};
  const domainStats = {}; // 域名统计：{域名: {count, totalDuration, avgDuration}}
  const interests = {}; // 细粒度兴趣
  let totalDuration = 0;
  const visitFrequency = {}; // 访问频率

  records.forEach(r => {
    const subCat = classifyWebsite(r.url || r.domain);
    const mainCat = SUBCATEGORY_TO_MAIN[subCat] || subCat;

    // 统计子分类
    subCategories[subCat] = (subCategories[subCat] || 0) + 1;

    // 统计主分类
    if (categories.hasOwnProperty(mainCat)) {
      categories[mainCat]++;
    } else {
      categories.other++;
    }

    const domain = r.domain || (r.url ? new URL(r.url).hostname : 'unknown');
    const duration = r.duration || 0;
    totalDuration += duration;

    // 域名统计
    if (!domainStats[domain]) {
      domainStats[domain] = { count: 0, totalDuration: 0, maxDuration: 0 };
    }
    domainStats[domain].count++;
    domainStats[domain].totalDuration += duration;
    domainStats[domain].maxDuration = Math.max(domainStats[domain].maxDuration, duration);

    // 分析标题，按停留时长加权（>2分钟=深度兴趣×3，>30秒=中度×1.5，否则×1）
    if (r.title) {
      const durationWeight = r.duration > 120 ? 3 : r.duration > 30 ? 1.5 : 1;
      analyzeTitle(r.title, interests, durationWeight);
    }
  });

  // 计算访问频率和专注度
  const domainFrequency = {};
  for (const [domain, stats] of Object.entries(domainStats)) {
    domainFrequency[domain] = stats.count;
  }

  // 识别深度用户 vs 广泛涉猎
  const sortedDomains = Object.entries(domainStats)
    .sort((a, b) => b[1].count - a[1].count);

  const topDomain = sortedDomains[0];
  const topDomainRatio = topDomain ? topDomain[1].count / records.length : 0;

  const browsingStyle = topDomainRatio > 0.5 ? 'focused' : topDomainRatio > 0.3 ? 'moderate' : 'diverse';

  const topDomains = sortedDomains.slice(0, 10).map(([domain, stats]) => ({
    domain,
    count: stats.count,
    avgDuration: stats.count > 0 ? Math.round(stats.totalDuration / stats.count) : 0,
    ratio: parseFloat((stats.count / records.length * 100).toFixed(1))
  }));

  const total = records.length || 1;
  const categoryPercentages = {};
  for (const [cat, count] of Object.entries(categories)) {
    categoryPercentages[cat] = parseFloat((count / total * 100).toFixed(1));
  }

  return {
    totalRecords: records.length,
    totalDuration,
    avgDuration: records.length > 0 ? Math.round(totalDuration / records.length) : 0,
    categories: categoryPercentages,
    subCategories,
    interests,
    topDomains,
    browsingStyle,
    dominantDomain: topDomain ? topDomain[0] : null,
    dominantDomainRatio: parseFloat((topDomainRatio * 100).toFixed(1)),
    visitFrequency: domainFrequency,
    lastSync: records.length > 0 ? records[records.length - 1].timestamp : null
  };
}

// 分析标题中的关键词
function analyzeTitle(title, interests, weight = 1) {
  const lowerTitle = title.toLowerCase();

  const add = (key, base) => { interests[key] = (interests[key] || 0) + base * weight; };

  // ===== 学习类 =====
  if (matchAny(lowerTitle, ['学习', '教程', '课程', '教学', '培训'])) add('learning', 2);
  if (matchAny(lowerTitle, ['英语', '日语', '韩语', '法语', '德语', '西班牙语', '语言学习'])) add('language_learning', 2);
  if (matchAny(lowerTitle, ['编程', '代码', 'python', 'javascript', 'java', 'c++', '算法', '软件开发', '程序员'])) add('programming', 2);
  if (matchAny(lowerTitle, ['数学', '物理', '化学', '生物', '理科', '微积分', '线性代数'])) add('stem_learning', 2);
  if (matchAny(lowerTitle, ['历史', '地理', '政治', '文科', '文学', '哲学'])) add('humanities', 2);
  if (matchAny(lowerTitle, ['考试', '考证', '考研', '考公', '上岸', '备考'])) add('exam_prep', 2);

  // ===== 娱乐类 =====
  if (matchAny(lowerTitle, ['舞蹈', '舞蹈教学', '编舞', '舞室'])) add('dance', 2);
  if (matchAny(lowerTitle, ['音乐', '歌曲', '翻唱', '演奏', '吉他', '钢琴', '音乐分享'])) add('music', 2);
  if (matchAny(lowerTitle, ['游戏', '攻略', '通关', '实况', '游戏解说', '主机游戏', '手游'])) add('gaming_content', 2);
  if (matchAny(lowerTitle, ['动漫', '动画', '新番', '番剧', '二次元', '宅'])) add('anime', 2);
  if (matchAny(lowerTitle, ['电影', '影评', '解说', '电影解说', '好莱坞', '国产电影'])) add('movie', 2);
  if (matchAny(lowerTitle, ['综艺', '选秀', '偶像', '追星', '演唱会'])) add('entertainment', 2);
  if (matchAny(lowerTitle, ['电视剧', '追剧', '韩剧', '美剧', '国产剧'])) add('tv_drama', 2);
  if (matchAny(lowerTitle, ['短视频', 'vlog', '生活记录', '日常分享', 'bilibili', '哔哩', 'b站'])) add('short_video', 1);
  if (matchAny(lowerTitle, ['猫', '狗', '宠物', '撸猫', '猫猫', '喵星人', '吸猫'])) add('pet_content', 2);

  // ===== 审美偏好 =====
  if (matchAny(lowerTitle, ['御姐', '熟女', '气质', '御姐音', '大长腿'])) add('mature_feminine', 2);
  if (matchAny(lowerTitle, ['萝莉', '可爱', '甜妹', '萌', '娃娃音'])) add('cute', 2);
  if (matchAny(lowerTitle, ['穿搭', '时尚', '美妆', '妆容', '护肤', '造型'])) add('fashion', 2);
  if (matchAny(lowerTitle, ['健身', '瑜伽', '塑形', '马甲线', '减脂', '增肌'])) add('fitness', 2);
  if (matchAny(lowerTitle, ['美食', '做饭', '烹饪', '食谱', '探店'])) add('food', 2);
  if (matchAny(lowerTitle, ['摄影', '拍照', '修图', '滤镜', '人像'])) add('photography', 2);
  if (matchAny(lowerTitle, ['旅游', '旅行', '出行', '攻略', '打卡'])) add('travel', 2);

  // ===== 知识类 =====
  if (matchAny(lowerTitle, ['科普', '知识', '原理', '讲解', '为什么', '揭秘'])) add('knowledge', 2);
  if (matchAny(lowerTitle, ['心理', '情感', '恋爱', '人际关系', '情商', '沟通'])) add('psychology', 2);
  if (matchAny(lowerTitle, ['科技', '数码', '手机', '电脑', '测评', '评测'])) add('tech', 2);
  if (matchAny(lowerTitle, ['财经', '投资', '股票', '理财', '赚钱', '副业', '创业'])) add('finance', 2);
  if (matchAny(lowerTitle, ['商业', '管理', '创业', '职场', '晋升'])) add('business', 2);
  if (matchAny(lowerTitle, ['社会', '热点', '新闻', '时事', '观点'])) add('social_issues', 1);
  if (matchAny(lowerTitle, ['星座', '塔罗', '命理', '玄学', '占卜'])) add('mysticism', 1);

  // ===== 社交/生活方式 =====
  if (matchAny(lowerTitle, ['情感', '恋爱', '脱单', '约会', '两性'])) add('relationship', 2);
  if (matchAny(lowerTitle, ['职场', '求职', '简历', '面试', '跳槽'])) add('career', 2);
  if (matchAny(lowerTitle, ['自我提升', '成长', '认知', '思维', '格局'])) add('self_improvement', 2);
  if (matchAny(lowerTitle, ['读书', '书单', '书评', '阅读', '书籍推荐'])) add('reading', 2);

  // ===== 游戏类 =====
  if (matchAny(lowerTitle, ['原神', '王者', '农药', 'LOL', '英雄联盟', '吃鸡', '永劫无间'])) add('moba_game', 1);
  if (matchAny(lowerTitle, ['塞尔达', '艾尔登法环', '黑魂', '只狼', '主机游戏'])) add('单机游戏', 1);
  if (matchAny(lowerTitle, ['我的世界', '沙盒', '建造'])) add('sandbox_game', 1);
  if (matchAny(lowerTitle, ['GTA', '赛车', '极品飞车'])) add('racing_game', 1);

  // ===== 职业/专业 =====
  if (matchAny(lowerTitle, ['产品经理', 'PM', '需求', '竞品'])) add('product_management', 1);
  if (matchAny(lowerTitle, ['设计', 'UI', 'UX', 'PS', 'Figma', '海报'])) add('design', 1);
  if (matchAny(lowerTitle, ['AI', '人工智能', 'ChatGPT', 'GPT', '大模型', '机器学习'])) add('ai_ml', 3); // 高权重
  if (matchAny(lowerTitle, ['数据', '分析', 'SQL', 'Excel', 'BI'])) add('data_analysis', 1);
}

function matchAny(text, keywords) {
  return keywords.some(k => text.includes(k));
}

// 主分析函数
function analyzeBrowsingData(browsingData) {
  const records = browsingData.records || [];
  return {
    profile: buildInterestProfile(records),
    domains: extractDomains(records),
    lastSync: browsingData.last_sync
  };
}

module.exports = {
  extractDomains,
  classifyWebsite,
  buildInterestProfile,
  analyzeBrowsingData
};

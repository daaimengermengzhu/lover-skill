// 仅保留明确的感情/恋爱词汇，避免在技术对话中误触发
// 排除了"喜欢"、"感情"、"朋友"等在技术讨论中也常见的词
const LOVE_KEYWORDS = [
  '恋爱', '约会', '表白', '追人', '追求',
  '男朋友', '女朋友', '男票', '女票',
  '暧昧', '前任', '分手', '复合', '相亲',
  '追男生', '追女生', '喜欢的人', '喜欢他', '喜欢她',
  '谈恋爱', '找对象', '找个对象', '脱单', '恋人', '爱情'
];

// 隐私设置路径
const PRIVACY_CONFIG_PATH = require('path').join(__dirname, '..', 'config', 'privacy-settings.json');

// 加载隐私设置
function loadPrivacySettings() {
  try {
    return JSON.parse(require('fs').readFileSync(PRIVACY_CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { data_collection: { consent_given: false } };
  }
}

// 保存隐私设置
function savePrivacySettings(settings) {
  try {
    require('fs').writeFileSync(PRIVACY_CONFIG_PATH, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

// 检查数据收集是否授权
function isDataCollectionAllowed() {
  const settings = loadPrivacySettings();
  return settings.data_collection?.consent_given === true;
}

function parseCommand(input) {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/lover') && !trimmed.startsWith('lover')) {
    if (detectLoveTopic(trimmed)) {
      return { cmd: 'auto', args: trimmed };
    }
    return { cmd: null, args: input };
  }

  const parts = trimmed.split(/\s+/).slice(1);
  const cmd = parts[0] || 'talk';
  const args = parts.slice(1).join(' ');

  return { cmd, args };
}

function detectLoveTopic(message) {
  const lower = message.toLowerCase();
  return LOVE_KEYWORDS.some(keyword => lower.includes(keyword));
}

async function handleCommand(cmd, args, context = {}) {
  switch (cmd) {
    case 'setup':
      return handleSetup(args, context);
    case 'talk':
      return handleTalk(args, context);
    case 'report':
      return handleReport(args, context);
    case 'profile':
      return handleProfile(args, context);
    case 'advice':
      return handleAdvice(args, context);
    case 'update':
      return handleUpdate(args, context);
    case 'regenerate':
      return handleRegenerate(args, context);
    case 'export':
      return handleExport(args, context);
    case 'reset':
      return handleReset(args, context);
    case 'memory':
      return handleMemory(args, context);
    case 'questionnaire':
      return handleQuestionnaire(args, context);
    case 'consent':
      return handleConsent(args, context);
    case 'auto':
      return handleAutoActivation(args, context);
    default:
      return { text: '未知命令，请使用 /lover help 查看可用命令' };
  }
}

async function handleSetup(args) {
  const settings = parseSettings(args);
  const privacySettings = loadPrivacySettings();

  // 检查是否首次使用（未设置过 consent）
  const needsConsent = privacySettings.data_collection.consent_given === false && privacySettings.data_collection.consent_date === null;

  if (needsConsent) {
    return {
      text: `恋人设置已保存：\n性别: ${settings.gender === 'female' ? '女性' : '男性'}\n年龄范围: ${settings.age_range.join('-')}岁\n\n---\n\n📊 **数据收集授权**\n\n为了生成更懂你的恋人，我会分析你的对话风格、情感表达和话题偏好。这些数据只存储在本地，绝不上传。\n\n输入 **/lover consent 是** 同意授权，或 **/lover consent 否** 跳过。\n拒绝授权也可以正常使用基础功能，但无法生成详细的人格分析报告。`,
      settings,
      pendingConsent: true
    };
  }

  return {
    text: `恋人设置已保存：\n性别: ${settings.gender === 'female' ? '女性' : '男性'}\n年龄范围: ${settings.age_range.join('-')}岁\n\n接下来会有 5 个简短的问题，帮助生成更真实的恋人。\n输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始（使用默认设置）。`,
    settings
  };
}

async function handleQuestionnaire(args, context) {
  const generator = require('./lover-generator');
  return {
    text: generator.formatQuestionnaireForDisplay(),
    type: 'questionnaire'
  };
}

async function handleTalk(args, context) {
  const { apiFunction } = context;
  if (!args) {
    return { text: '开始和你的恋人对话吧！\n输入 /lover profile 查看她的档案。' };
  }
  const engine = require('./conversation-engine');
  const result = await engine.generateResponse(args, apiFunction);
  if (result.error) return { text: '你还没有生成恋人，请先运行 /lover setup 完成初始设置。' };
  return { text: result.response, loverName: result.loverName };
}

async function handleReport(args, context) {
  const { apiFunction } = context;
  const engine = require('./conversation-engine');
  const result = await engine.generateReport(apiFunction);
  if (result.error) return { text: result.message };
  return { text: result.report };
}

async function handleProfile(args) {
  const db = require('./db-manager');
  const generator = require('./lover-generator');
  const lover = db.loadLoverProfile();
  if (!lover) return { text: '你还没有生成恋人。使用 /lover setup 开始。' };
  return { text: generator.formatLoverProfile(lover) };
}

async function handleAdvice(args, context) {
  const { apiFunction } = context;
  if (!args) return { text: '请描述你的情况，比如：\n/lover advice 我不知道怎么跟喜欢的人开口' };
  const engine = require('./conversation-engine');
  const result = await engine.generateAdvice(args, apiFunction);
  if (result.error) return { text: result.message };
  return { text: result.advice, loverName: result.loverName };
}

async function handleUpdate(args, context) {
  const analyzer = require('./persona-analyzer');
  const result = await analyzer.analyze();
  if (result.status === 'insufficient_data') {
    return { text: `数据还不够，需要更多对话才能更新分析。` };
  }
  return { text: '分析已更新！使用 /lover report 查看新报告。' };
}

async function handleRegenerate(args) {
  const db = require('./db-manager');
  const generator = require('./lover-generator');
  const profile = db.loadUserProfile();
  const config = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'config', 'privacy-settings.json'), 'utf8'));

  // 读取之前的问卷答案（如果有）
  const existingLover = db.loadLoverProfile();
  const previousAnswers = existingLover?.questionnaireAnswers || null;

  await generator.generate(profile || {}, config.lover_settings, previousAnswers);
  return { text: '恋人已重新生成！\n使用 /lover profile 查看新恋人档案。\n如需重新回答问卷，使用 /lover questionnaire。' };
}

async function handleMemory(args, context) {
  const engine = require('./conversation-engine');
  const db = require('./db-manager');
  const lover = db.loadLoverProfile();
  const summary = engine.getHistorySummary();

  if (!lover) return { text: '你还没有生成恋人。' };
  if (!summary.memorySummary) {
    return { text: `${lover.name} 还没有什么特别记住的事。\n多聊几次，她会慢慢记住你说过的事情。` };
  }

  const daysSince = summary.summaryLastUpdated
    ? Math.floor((Date.now() - new Date(summary.summaryLastUpdated)) / (1000 * 60 * 60 * 24))
    : null;

  return {
    text: `## ${lover.name} 记得这些事\n\n${summary.memorySummary}\n\n---\n最后更新：${daysSince !== null ? (daysSince === 0 ? '今天' : `${daysSince} 天前`) : '未知'}\n共 ${summary.sessionCount || 0} 次对话会话 | 总计 ${summary.totalMessages} 条消息`
  };
}

async function handleExport() {
  const db = require('./db-manager');
  const data = db.exportAllData();
  return { text: '数据已导出。', data };
}

async function handleReset() {
  const db = require('./db-manager');
  db.resetAllData();
  return { text: '所有数据已删除。使用 /lover setup 重新设置。' };
}

async function handleAutoActivation(args) {
  return { text: `检测到恋爱话题！\n\n你想聊恋爱的事？我可以帮你分析或给建议。\n输入 /lover talk 开始，或者直接描述你的困惑。` };
}

async function handleConsent(args, context) {
  const isConsent = args.includes('是') || args.includes('同意') || args.toLowerCase().includes('yes') || args === 'y';
  const isReject = args.includes('否') || args.includes('拒绝') || args.toLowerCase().includes('no') || args === 'n';

  if (!isConsent && !isReject) {
    return { text: `请明确回复：**/lover consent 是** 同意授权，或 **/lover consent 否** 拒绝。\n\n授权后我会分析你的对话风格来生成更懂你的恋人，数据仅存储在本地。` };
  }

  const privacySettings = loadPrivacySettings();

  if (isConsent) {
    privacySettings.data_collection.consent_given = true;
    privacySettings.data_collection.consent_date = new Date().toISOString();
    savePrivacySettings(privacySettings);
    return { text: `✅ 数据收集授权已开启！\n\n感谢信任。我会分析你的对话风格、情感表达和话题偏好，这些数据只存储在本地。\n\n现在可以输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始对话！` };
  } else {
    privacySettings.data_collection.consent_given = false;
    privacySettings.data_collection.consent_date = new Date().toISOString();
    savePrivacySettings(privacySettings);
    return { text: `✅ 已记录。不授权也可以正常使用基础功能。\n\n输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始！` };
  }
}

function parseSettings(args) {
  const settings = { gender: 'female', age_range: [20, 35] };
  if (args.includes('male') || args.includes('男')) settings.gender = 'male';
  const ageMatch = args.match(/(\d{2})-(\d{2})/);
  if (ageMatch) settings.age_range = [parseInt(ageMatch[1]), parseInt(ageMatch[2])];
  return settings;
}

module.exports = {
  parseCommand,
  detectLoveTopic,
  handleCommand
};

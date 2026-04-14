// 仅保留明确的感情/恋爱词汇，避免在技术讨论中误触发
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const LOVE_KEYWORDS = [
  '恋爱', '约会', '表白', '追人', '追求',
  '男朋友', '女朋友', '男票', '女票',
  '暧昧', '前任', '分手', '复合', '相亲',
  '追男生', '追女生', '喜欢的人', '喜欢他', '喜欢她',
  '谈恋爱', '找对象', '找个对象', '脱单', '恋人', '爱情'
];

const PRIVACY_CONFIG_PATH = path.join(__dirname, '..', 'config', 'privacy-settings.json');

function loadPrivacySettings() {
  try {
    return JSON.parse(fs.readFileSync(PRIVACY_CONFIG_PATH, 'utf8'));
  } catch (e) {
    return { data_collection: { consent_given: false } };
  }
}

function savePrivacySettings(settings) {
  try {
    fs.writeFileSync(PRIVACY_CONFIG_PATH, JSON.stringify(settings, null, 2));
    return true;
  } catch (e) {
    return false;
  }
}

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
    case 'setup': return handleSetup(args, context);
    case 'talk': return handleTalk(args, context);
    case 'report': return handleReport(args, context);
    case 'profile': return handleProfile(args, context);
    case 'advice': return handleAdvice(args, context);
    case 'update': return handleUpdate(args, context);
    case 'regenerate': return handleRegenerate(args, context);
    case 'export': return handleExport(args, context);
    case 'reset': return handleReset(args, context);
    case 'memory': return handleMemory(args, context);
    case 'questionnaire': return handleQuestionnaire(args, context);
    case 'answer': return handleAnswer(args, context);
    case 'consent': return handleConsent(args, context);
    case 'import': return handleImport(args, context);
    case 'auto': return handleAutoActivation(args, context);
    case 'help': return handleHelp();
    default: return { text: '未知命令，请使用 /lover help 查看可用命令' };
  }
}

async function handleSetup(args) {
  const settings = parseSettings(args);
  const privacySettings = loadPrivacySettings();

  // 将用户设置持久化到 privacy-settings.json
  privacySettings.lover_settings = {
    ...privacySettings.lover_settings,
    gender: settings.gender,
    age_range: settings.age_range,
    name: settings.name || privacySettings.lover_settings?.name || null
  };
  savePrivacySettings(privacySettings);

  const needsConsent = privacySettings.data_collection.consent_given === false &&
                       privacySettings.data_collection.consent_date === null;

  if (needsConsent) {
    return {
      text: '恋人设置已保存：\n性别: ' + (settings.gender === 'female' ? '女性' : '男性') + '\n年龄范围: ' + settings.age_range.join('-') + '岁\n\n---\n\n📊 数据收集授权\n\n为了生成更懂你的恋人，我会分析你的对话风格、情感表达和话题偏好。这些数据只存储在本地，绝不上传。\n\n输入 /lover consent 是 同意授权，或 /lover consent 否 跳过。',
      settings,
      pendingConsent: true
    };
  }

  return {
    text: '恋人设置已保存：\n性别: ' + (settings.gender === 'female' ? '女性' : '男性') + '\n年龄范围: ' + settings.age_range.join('-') + '岁\n\n接下来会有 5 个简短的问题，帮助生成更真实的恋人。\n输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始（使用默认设置）。',
    settings
  };
}

async function handleQuestionnaire(args, context) {
  const generator = require('./lover-generator');

  // 如果附带了答案（如 /lover questionnaire 2 1 2 3 4），直接解析并生成
  const answerParts = (args || '').trim().split(/[\s,，]+/).filter(Boolean);
  if (answerParts.length >= 3) {
    return handleAnswer(args, context);
  }

  // 否则展示问卷题目
  const display = generator.formatQuestionnaireForDisplay();
  return {
    text: display + '\n\n💡 **回答方式**：\n' +
      '• 直接回复 5 个数字，如：`/lover answer 2 1 2 3 4`\n' +
      '• 或者用自己的话描述，如：`/lover answer 简洁来回 被理解 先冷静 弹性的 记住我说过的事`\n' +
      '• 或者说"跳过"直接生成默认恋人',
    type: 'questionnaire'
  };
}

async function handleAnswer(args, context) {
  const generator = require('./lover-generator');
  const db = require('./db-manager');

  if (!args || args.trim() === '' || args.trim() === '跳过') {
    // 跳过问卷，用默认设置生成
    const config = loadPrivacySettings();
    const profile = db.loadUserProfile() || {};
    const lover = await generator.generate(profile, config.lover_settings, null);
    return {
      text: '✨ 遇见了\n\n' + generator.formatLoverProfile(lover) +
        '\n\n现在可以直接跟 ' + lover.name + ' 聊天了。\n' +
        '`/lover talk` 开始对话 | `/lover profile` 查看档案'
    };
  }

  // 解析答案：支持“2 1 2 3 4” 或 “简洁来回 被理解 先冷静 弹性的 记住我说过的事”
  const parts = args.trim().split(/[\s,，]+/).filter(Boolean);
  const rawAnswers = {};
  const keys = ['q1', 'q2', 'q3', 'q4', 'q5'];

  parts.forEach((val, i) => {
    if (i < 5) {
      rawAnswers[keys[i]] = val;
    }
  });

  const parsedAnswers = generator.parseQuestionnaireAnswers(rawAnswers);

  // 检查解析结果
  const parsedCount = Object.keys(parsedAnswers).length;
  if (parsedCount === 0) {
    return {
      text: '❌ 无法解析你的答案。请用数字或关键词回答，例如：\n' +
        '`/lover answer 2 1 2 3 4`\n' +
        '`/lover answer 简洁来回 被理解 先冷静 弹性的 记住我说过的事`\n\n' +
        '或输入 `/lover answer 跳过` 使用默认设置。'
    };
  }

  // 生成恋人
  const config = loadPrivacySettings();
  const profile = db.loadUserProfile() || {};
  const lover = await generator.generate(profile, config.lover_settings, parsedAnswers);

  const answeredQuestions = Object.entries(parsedAnswers)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');

  return {
    text: '✨ 遇见了\n\n' +
      '📝 问卷解析（' + parsedCount + '/5 题）：' + answeredQuestions + '\n\n' +
      generator.formatLoverProfile(lover) +
      '\n\n现在可以直接跟 ' + lover.name + ' 聊天了。\n' +
      '`/lover talk` 开始对话 | `/lover profile` 查看档案'
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
    return { text: '数据还不够，需要更多对话才能更新分析。' };
  }
  return { text: '分析已更新！使用 /lover report 查看新报告。' };
}

async function handleRegenerate(args) {
  const db = require('./db-manager');
  const generator = require('./lover-generator');
  const profile = db.loadUserProfile();
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'privacy-settings.json'), 'utf8'));
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
    return { text: lover.name + ' 还没有什么特别记住的事。\n多聊几次，她会慢慢记住你说过的事情。' };
  }
  const daysSince = summary.summaryLastUpdated
    ? Math.floor((Date.now() - new Date(summary.summaryLastUpdated)) / (1000 * 60 * 60 * 24))
    : null;
  return {
    text: '## ' + lover.name + ' 记得这些事\n\n' + summary.memorySummary + '\n\n---\n最后更新：' +
      (daysSince !== null ? (daysSince === 0 ? '今天' : daysSince + ' 天前') : '未知') +
      '\n共 ' + (summary.sessionCount || 0) + ' 次对话会话 | 总计 ' + summary.totalMessages + ' 条消息'
  };
}

async function handleExport() {
  const db = require('./db-manager');
  const data = db.exportAllData();
  const exportDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportPath = path.join(exportDir, `export_${timestamp}.json`);
  fs.writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf8');
  return { text: '数据已导出到：\n' + exportPath, data };
}

async function handleReset(args) {
  // 需要二次确认
  if (!args || !args.includes('确认删除')) {
    return {
      text: '⚠️ 确定要删除所有数据吗？这将清除：\n• 你的人格分析数据\n• 恋人档案和对话记忆\n• 所有对话历史\n\n输入 `/lover reset 确认删除` 继续，或忽略取消。'
    };
  }
  const db = require('./db-manager');
  db.resetAllData();
  const privacySettings = loadPrivacySettings();
  privacySettings.data_collection.consent_given = false;
  privacySettings.data_collection.consent_date = null;
  savePrivacySettings(privacySettings);
  return { text: '所有数据已删除。使用 /lover setup 重新设置。' };
}

async function handleAutoActivation(args) {
  return { text: '检测到恋爱话题！\n\n你想聊恋爱的事？我可以帮你分析或给建议。\n输入 /lover talk 开始，或者直接描述你的困惑。' };
}

function handleHelp() {
  return {
    text: '## Lover Skill 命令帮助\n\n' +
      '| 命令 | 功能 |\n|------|------|\n' +
      '| `/lover setup` | 首次设置（性别、年龄范围、名字） |\n' +
      '| `/lover questionnaire` | 5 题问卷，影响恋人性格 |\n' +
      '| `/lover talk [消息]` | 和恋人聊天 |\n' +
      '| `/lover profile` | 查看恋人档案 |\n' +
      '| `/lover advice <情况>` | 获得恋爱建议 |\n' +
      '| `/lover memory` | 查看恋人记住的事 |\n' +
      '| `/lover report` | 人格分析报告 |\n' +
      '| `/lover update` | 更新人格分析 |\n' +
      '| `/lover regenerate` | 重新生成恋人 |\n' +
      '| `/lover import` | 导入聊天记录/照片 |\n' +
      '| `/lover export` | 导出所有数据 |\n' +
      '| `/lover consent 是/否` | 开启/关闭数据收集 |\n' +
      '| `/lover reset` | 删除所有数据 |\n' +
      '| `/lover help` | 显示本帮助 |'
  };
}

async function handleConsent(args, context) {
  const isConsent = args.includes('是') || args.includes('同意') || args.toLowerCase().includes('yes') || args === 'y';
  const isReject = args.includes('否') || args.includes('拒绝') || args.toLowerCase().includes('no') || args === 'n';

  if (!isConsent && !isReject) {
    return { text: '请明确回复：/lover consent 是 同意授权，或 /lover consent 否 拒绝。\n\n授权后我会分析你的对话风格来生成更懂你的恋人，数据仅存储在本地。' };
  }

  const privacySettings = loadPrivacySettings();
  if (isConsent) {
    privacySettings.data_collection.consent_given = true;
    privacySettings.data_collection.consent_date = new Date().toISOString();
    savePrivacySettings(privacySettings);
    return { text: '✅ 数据收集授权已开启！\n\n感谢信任。我会分析你的对话风格、情感表达和话题偏好，这些数据只存储在本地。\n\n现在可以输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始对话！' };
  } else {
    privacySettings.data_collection.consent_given = false;
    privacySettings.data_collection.consent_date = new Date().toISOString();
    savePrivacySettings(privacySettings);
    return { text: '✅ 已记录。不授权也可以正常使用基础功能。\n\n输入 /lover questionnaire 开始问卷，或 /lover talk 直接开始！' };
  }
}

async function handleImport(args, context) {
  if (!args || args === 'help') {
    return {
      text: '📁 导入数据 — 帮助恋人更懂你\n\n支持类型：\n[A] 微信聊天记录：/lover import wechat <文件路径>\n[B] 照片文件夹：/lover import photos <文件夹路径>\n[C] 社交截图：/lover import social <文件路径>\n[D] 直接粘贴：/lover import paste\n\n示例：\n/lover import wechat C:\\Users\\xxx\\Documents\\聊天记录.txt\n/lover import photos C:\\Users\\xxx\\Pictures\\相册'
    };
  }

  const parts = args.split(/\s+/);
  const type = parts[0].toLowerCase();
  const filePath = parts.slice(1).join(' ');

  if (type === 'wechat') {
    return handleWechatImport(filePath);
  } else if (type === 'photos') {
    return handlePhotosImport(filePath);
  } else if (type === 'social') {
    return { text: '收到社交媒体截图路径：' + filePath + '\n\n直接发图片给我，我会分析你的兴趣和审美偏好。' };
  } else if (type === 'paste') {
    return { text: '📝 请直接粘贴聊天记录内容。可以是微信/QQ聊天记录，或任何文字对话。粘贴后我会分析你的沟通风格。' };
  } else {
    return { text: '未知的数据类型：' + type + '。输入 /lover import help 查看用法。' };
  }
}

async function handleWechatImport(filePath) {
  if (!filePath) {
    return { text: '请提供聊天记录文件路径，例如：\n/lover import wechat C:\\Users\\xxx\\Documents\\聊天记录.txt' };
  }
  if (!fs.existsSync(filePath)) {
    return { text: '文件不存在：' + filePath };
  }

  const skillDir = path.join(__dirname, '..');
  const outputPath = path.join(os.tmpdir(), 'wechat_analysis_' + Date.now() + '.txt');

  try {
    const cmd = 'python "' + path.join(skillDir, 'tools', 'wechat_parser.py') + '" --file "' + filePath + '" --target "对方" --output "' + outputPath + '"';
    execSync(cmd, { encoding: 'utf8', timeout: 30000 });

    if (!fs.existsSync(outputPath)) {
      return { text: '解析失败，未能生成分析结果。' };
    }

    const result = fs.readFileSync(outputPath, 'utf8').trim();
    fs.unlinkSync(outputPath);

    saveImportedData('wechat', { analysis: result, sourceFile: filePath, importedAt: new Date().toISOString() });

    return { text: '✅ 微信聊天记录解析完成！\n\n**分析结果：**\n\n' + result + '\n\n---\n这份分析已存入你的画像，恋人会据此更懂你。' };
  } catch (e) {
    return { text: '解析失败：' + e.message + '\n\n请确认：\n1. 已安装 Python 3\n2. 文件格式为 txt / html / json\n\n也可以直接粘贴聊天记录给我分析。' };
  }
}

async function handlePhotosImport(dirPath) {
  if (!dirPath) {
    return { text: '请提供照片文件夹路径，例如：\n/lover import photos C:\\Users\\xxx\\Pictures\\相册' };
  }
  if (!fs.existsSync(dirPath)) {
    return { text: '文件夹不存在：' + dirPath };
  }

  const skillDir = path.join(__dirname, '..');
  const outputPath = path.join(os.tmpdir(), 'photo_analysis_' + Date.now() + '.txt');

  try {
    const cmd = 'python "' + path.join(skillDir, 'tools', 'photo_analyzer.py') + '" --dir "' + dirPath + '" --output "' + outputPath + '"';
    execSync(cmd, { encoding: 'utf8', timeout: 60000 });

    if (!fs.existsSync(outputPath)) {
      return { text: '分析失败，未能生成结果。' };
    }

    const result = fs.readFileSync(outputPath, 'utf8').trim();
    fs.unlinkSync(outputPath);

    saveImportedData('photos', { analysis: result, sourceDir: dirPath, importedAt: new Date().toISOString() });

    return { text: '✅ 照片分析完成！\n\n**分析结果：**\n\n' + result + '\n\n---\n分析结果已存入你的画像。' };
  } catch (e) {
    return { text: '分析失败：' + e.message + '\n\n请确认：\n1. 已安装 Python 3\n2. 已安装 Pillow：pip install Pillow\n3. 文件夹中有 jpg/png/heic 格式照片\n\n不需要把所有照片发给我，发几张有代表性的就行。' };
  }
}

function saveImportedData(type, data) {
  try {
    const db = require('./db-manager');
    const profile = db.loadUserProfile() || {};
    profile.importedData = profile.importedData || {};
    profile.importedData[type] = data;
    profile.importedAt = new Date().toISOString();
    db.saveUserProfile(profile);
  } catch (e) {
    console.log('[handleImport] 保存导入数据失败:', e.message);
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

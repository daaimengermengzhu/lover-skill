/**
 * conversation-engine.js — 对话引擎
 * 处理与恋人的对话和恋爱建议
 *
 * v2 新增：会话摘要机制（参考 ex-skill/yourself-skill 的跨会话记忆设计）
 * 原理：每次会话结束时，将关键信息压缩为摘要文字存储，下次会话开始时注入 context
 * 这样恋人能"记住"你说过的重要事情，而不只是记住最近几条消息
 *
 * v2.1 新增：行为追踪集成
 * 每次对话自动调用 behavior-tracker 追踪用户语言风格、情感、话题等
 * 追踪数据用于 persona-analyzer 生成用户人格报告
 */

const db = require('./db-manager');
const loverGenerator = require('./lover-generator');
const tracker = require('./behavior-tracker');
const fs = require('fs');
const path = require('path');

// 检查用户是否同意数据收集
function isConsentGiven() {
  try {
    const configPath = path.join(__dirname, '..', 'config', 'privacy-settings.json');
    const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return settings.data_collection?.consent_given === true;
  } catch (e) {
    return false;
  }
}

class ConversationEngine {
  constructor() {
    this.maxHistoryLength = 50;
    this.currentSessionMessages = []; // 当前会话的新消息（未摘要）
    // 从持久化存储加载历史，避免重启丢失
    this.conversationHistory = db.loadConversationHistory();
  }

  // 加载恋人设置
  loadLover() {
    return db.loadLoverProfile() || null;
  }

  // ─────────────────────────────────────────────────────────────────
  // 会话摘要机制
  // ─────────────────────────────────────────────────────────────────

  // 获取当前存储的摘要（跨会话记忆）
  getMemorySummary() {
    return db.loadMemorySummary();
  }

  // 构建包含摘要的完整 context
  buildContextWithSummary(lover) {
    const summary = this.getMemorySummary();
    const recentHistory = this.conversationHistory.slice(-8); // 最近 8 条

    let contextParts = [];

    // 注入跨会话摘要
    if (summary?.content) {
      contextParts.push(`## 你记得关于他/她的这些事\n\n${summary.content}`);
      if (summary.lastUpdated) {
        const daysAgo = Math.floor((Date.now() - new Date(summary.lastUpdated)) / (1000 * 60 * 60 * 24));
        if (daysAgo > 0) contextParts.push(`（这些是 ${daysAgo} 天前记录的）`);
      }
    }

    // 注入最近对话
    if (recentHistory.length > 0) {
      const historyText = recentHistory
        .map(m => `${m.role === 'user' ? '他/她' : lover.name}：${m.content}`)
        .join('\n');
      contextParts.push(`## 最近的对话\n\n${historyText}`);
    }

    return contextParts.join('\n\n---\n\n');
  }

  // 生成新的会话摘要（调用 API 总结本次会话要点）
  async generateSessionSummary(lover, apiFunction) {
    if (this.currentSessionMessages.length < 3) return null; // 太少不值得总结

    const sessionText = this.currentSessionMessages
      .map(m => `${m.role === 'user' ? '他/她' : lover.name}：${m.content}`)
      .join('\n');

    const existingSummary = this.getMemorySummary();

    const summaryPrompt = `你是 ${lover.name}，需要把最近这次聊天中值得记住的事情记录下来。

${existingSummary?.content ? `你之前记录过：\n${existingSummary.content}\n\n` : ''}

这次聊天的内容：
${sessionText}

---

请提取其中值得记住的关键信息，包括：
- 对方说过的重要的事情（工作、家庭、情绪、最近发生的事）
- 对方提到的偏好、喜欢或不喜欢的事
- 两个人聊到的重要话题
- 任何值得下次提到的细节

要求：
1. 只记录真的重要的，不要把每件事都写进去
2. 用第一人称口吻（"他/她提到..."）
3. 控制在 200 字以内
4. 如果没有什么新的值得记住，回复"无新内容"

直接输出记录内容，不需要解释：`;

    try {
      const newSummary = await apiFunction(summaryPrompt);
      if (newSummary && newSummary !== '无新内容') {
        // 合并新旧摘要（旧摘要 + 新摘要，超过 500 字则只保留新的）
        let mergedContent = newSummary;
        if (existingSummary?.content) {
          const combined = `${existingSummary.content}\n\n最近新增：\n${newSummary}`;
          mergedContent = combined.length < 500 ? combined : newSummary;
        }
        db.saveMemorySummary({
          content: mergedContent,
          lastUpdated: new Date().toISOString(),
          sessionCount: (existingSummary?.sessionCount || 0) + 1
        });
      }
      return newSummary;
    } catch (e) {
      return null; // 摘要失败不影响正常使用
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 核心：构建对话 Prompt
  // ─────────────────────────────────────────────────────────────────

  buildConversationPrompt(lover, userMessage) {
    const loverPrompt = loverGenerator.getLoverPrompt(lover);
    const context = this.buildContextWithSummary(lover);

    return `${loverPrompt}

---

${context ? `${context}\n\n---\n\n` : ''}他/她：${userMessage}
${lover.name}：`;
  }

  // ─────────────────────────────────────────────────────────────────
  // 生成对话响应
  // ─────────────────────────────────────────────────────────────────

  async generateResponse(userMessage, apiFunction) {
    const lover = this.loadLover();
    if (!lover) {
      return { error: true, message: '你还没有生成恋人，请先运行 /lover setup' };
    }

    // 记录到当前会话
    const userEntry = { role: 'user', content: userMessage, timestamp: new Date().toISOString() };
    this.conversationHistory.push(userEntry);
    this.currentSessionMessages.push(userEntry);

    // 追踪用户消息的语言风格、情感、话题等（仅在用户同意数据收集时）
    if (isConsentGiven()) {
      tracker.trackMessage(userEntry);
    }

    // 保持历史长度
    if (this.conversationHistory.length > this.maxHistoryLength) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
    }

    const prompt = this.buildConversationPrompt(lover, userMessage);

    try {
      const response = await apiFunction(prompt);

      const loverEntry = { role: 'lover', content: response, timestamp: new Date().toISOString() };
      this.conversationHistory.push(loverEntry);
      this.currentSessionMessages.push(loverEntry);

      // 追踪恋人回复（仅在用户同意数据收集时）
      if (isConsentGiven()) {
        tracker.trackMessage(loverEntry);
      }

      // 持久化保存历史
      db.saveConversationHistory(this.conversationHistory);

      // 每 6 轮对话尝试更新摘要（后台，不阻塞）
      if (this.currentSessionMessages.length % 12 === 0) {
        this.generateSessionSummary(lover, apiFunction).catch(() => {});
        // 每 6 轮也保存一次会话数据（供 persona-analyzer 分析）
        if (isConsentGiven()) {
          tracker.endSession();
        }
      }

      return { error: false, response, loverName: lover.name };
    } catch (error) {
      return { error: true, message: '生成回复失败：' + error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 生成恋爱建议
  // ─────────────────────────────────────────────────────────────────

  async generateAdvice(situation, apiFunction) {
    const lover = this.loadLover();
    const profile = db.loadUserProfile();

    if (!lover) {
      return { error: true, message: '你还没有生成恋人，请先运行 /lover setup' };
    }

    const loverPrompt = loverGenerator.getLoverPrompt(lover);
    const summary = this.getMemorySummary();

    const advicePrompt = `${loverPrompt}

---

${summary?.content ? `你记得关于他/她的这些事：\n${summary.content}\n\n---\n\n` : ''}${profile ? `他/她的一些特点：
- 依恋类型：${profile.attachmentStyle || '安全型'}
- 爱情语言：${profile.loveLanguages?.primary || '言语型'}
- 沟通风格：${profile.communicationStyle || '平衡型'}

---

` : ''}他/她遇到了这样一个情况：
${situation}

请从 ${lover.name} 的角度给出建议。要：
1. 先表示理解对方的感受
2. 给出具体可操作的建议
3. 语气像真实的人在关心你，不是在分析或说教
4. 可以分享自己的感受或经历
5. 不要超过 5 句话

${lover.name}：`;

    try {
      const advice = await apiFunction(advicePrompt);
      return { error: false, advice, loverName: lover.name };
    } catch (error) {
      return { error: true, message: '生成建议失败：' + error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 生成分析报告
  // ─────────────────────────────────────────────────────────────────

  async generateReport(apiFunction) {
    const profile = db.loadUserProfile();

    if (!profile) {
      return { error: true, message: '还没有足够的数据生成分析报告。请先运行 `/lover update`（基于已有对话+浏览数据分析）或继续使用一段时间。' };
    }

    // 在纯 CLI / 无 LLM 的环境下降级为结构化输出，避免报错
    if (typeof apiFunction !== 'function') {
      const formatter = require('./profile-formatter');
      const structured = formatter.formatProfileStructured(profile);
      return {
        error: false,
        report: structured + '\n\n> 提示：当前不在 Claude 会话里，已降级为结构化输出。在 Claude 会话里说「看看我的人格报告」可以拿到温暖版长篇解读。',
        profile,
        fallback: true
      };
    }

    const reportPrompt = `# 任务：生成用户潜意识人格分析报告

## 用户人格数据
${JSON.stringify(profile, null, 2)}

---

请生成一份详细的人格分析报告，包含：
1. 大五人格分析（用进度条 ████░░ 形式展示分数）
2. 依恋类型解读
3. 爱情语言分析
4. 沟通风格描述
5. 亲密关系中的优势和潜在挑战
6. 给用户的 2-3 条具体建议

报告要求：
- 语言温暖，像朋友在帮你分析
- 避免过于学术化的表述
- 给出具体的建议，不是泛泛的
- 强调这是帮助了解自己，不是给贴标签
- 使用 Markdown 格式
- 可以用 emoji 增加可读性`;

    try {
      const report = await apiFunction(reportPrompt);
      return { error: false, report, profile };
    } catch (error) {
      return { error: true, message: '生成报告失败：' + error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // 会话结束时主动保存摘要（供外部调用）
  // ─────────────────────────────────────────────────────────────────

  async onSessionEnd(apiFunction) {
    const lover = this.loadLover();
    if (!lover || this.currentSessionMessages.length < 3) return;
    await this.generateSessionSummary(lover, apiFunction).catch(() => {});
    this.currentSessionMessages = []; // 清空当前会话缓存
    // 保存会话数据供人格分析使用（仅在用户同意时）
    if (isConsentGiven()) {
      tracker.endSession();
    }
  }

  // 清除对话历史
  clearHistory() {
    this.conversationHistory = [];
    this.currentSessionMessages = [];
    db.saveConversationHistory([]);
    db.saveMemorySummary(null);
    return true;
  }

  // 获取对话历史摘要
  getHistorySummary() {
    const summary = this.getMemorySummary();
    return {
      totalMessages: this.conversationHistory.length,
      currentSessionMessages: this.currentSessionMessages.length,
      memorySummary: summary?.content ? `${summary.content.substring(0, 100)}...` : null,
      summaryLastUpdated: summary?.lastUpdated || null,
      sessionCount: summary?.sessionCount || 0,
      firstMessage: this.conversationHistory[0]?.timestamp,
      lastMessage: this.conversationHistory[this.conversationHistory.length - 1]?.timestamp
    };
  }
}

module.exports = new ConversationEngine();

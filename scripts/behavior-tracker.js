/**
 * behavior-tracker.js — 行为追踪模块
 * 分析用户对话中的语言风格、决策模式、情感表达等
 */

const db = require('./db-manager');

class BehaviorTracker {
  constructor() {
    this.currentSession = {
      id: Date.now(),
      startTime: new Date().toISOString(),
      messages: [],
      languageMetrics: {},
      decisionPatterns: [],
      emotionalExpressions: [],
      topics: [],
      interactionMetrics: {}
    };
    this.initializeMetrics();
  }

  initializeMetrics() {
    this.currentSession.languageMetrics = {
      totalMessages: 0,
      totalWords: 0,
      avgWordsPerMessage: 0,
      questionCount: 0,
      exclamationCount: 0,
      emojiCount: 0,
      formalRatio: 0,
      informalWords: 0,
      sentimentWords: { positive: 0, negative: 0, neutral: 0 }
    };
    this.currentSession.interactionMetrics = {
      commandsIssued: 0,
      modificationsRequested: 0,
      confirmationsGiven: 0,
      rejectionsGiven: 0,
      clarificationsRequested: 0
    };
  }

  // 分析单条消息
  trackMessage(message) {
    const msg = message.content || message;
    this.currentSession.messages.push({
      text: msg,
      timestamp: new Date().toISOString(),
      role: message.role
    });

    // 语言分析
    this.analyzeLanguage(msg);

    // 情感分析
    this.analyzeSentiment(msg);

    // 话题检测
    this.detectTopics(msg);

    // 交互模式
    this.analyzeInteraction(msg);
  }

  analyzeLanguage(text) {
    const metrics = this.currentSession.languageMetrics;
    metrics.totalMessages++;

    // 词数统计
    const words = text.split(/\s+/).filter(w => w.length > 0);
    metrics.totalWords += words.length;

    // 问题检测
    if (text.includes('?')) metrics.questionCount++;

    // 感叹词检测
    if (text.includes('!')) metrics.exclamationCount++;

    // Emoji 检测
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = text.match(emojiRegex);
    if (emojis) metrics.emojiCount += emojis.length;

    // 正式/非正式词汇
    const informalIndicators = ['真的', '其实', '感觉', '我觉得', '好像', '大概', '应该', '反正', '简直', '超'];
    informalIndicators.forEach(word => {
      if (text.includes(word)) metrics.informalWords++;
    });

    metrics.avgWordsPerMessage = metrics.totalWords / metrics.totalMessages;
  }

  analyzeSentiment(text) {
    const metrics = this.currentSession.languageMetrics;

    const positiveWords = ['开心', '高兴', '喜欢', '爱', '快乐', '幸福', '满意', '期待', '兴奋', '棒', '好', '赞', '甜', '暖'];
    const negativeWords = ['难过', '伤心', '失望', '生气', '讨厌', '害怕', '担心', '焦虑', '郁闷', '烦躁', '委屈', '累', '烦', '讨厌'];

    let hasPositive = false;
    let hasNegative = false;

    positiveWords.forEach(word => {
      if (text.includes(word)) {
        hasPositive = true;
        metrics.sentimentWords.positive++;
      }
    });

    negativeWords.forEach(word => {
      if (text.includes(word)) {
        hasNegative = true;
        metrics.sentimentWords.negative++;
      }
    });

    if (!hasPositive && !hasNegative) {
      metrics.sentimentWords.neutral++;
    }
  }

  detectTopics(text) {
    const topicKeywords = {
      '感情/恋爱': ['喜欢', '爱', '约会', '恋爱', '追求', '表白', '分手', '前任', '暧昧', '对象', '男票', '女票', '男朋友', '女朋友', '约会', '亲吻', '牵手'],
      '工作/事业': ['工作', '上班', '老板', '同事', '升职', '加薪', '辞职', '面试', '项目', '客户', '会议'],
      '学习/成长': ['学习', '考试', '读书', '课程', '培训', '考试', '成绩', '学校', '毕业'],
      '家庭/亲情': ['父母', '家人', '妈妈', '爸爸', '回家', '亲戚', '孩子', '结婚'],
      '社交/友谊': ['朋友', '聚会', '社交', '闺蜜', '兄弟', '朋友圈', '微信'],
      '娱乐/兴趣': ['电影', '音乐', '游戏', '旅行', '美食', '运动', '健身', '追剧', '综艺'],
      '科技/数码': ['手机', '电脑', 'App', '软件', '代码', '编程', '数码'],
      '健康/生活': ['健康', '运动', '减肥', '睡眠', '饮食', '医院', '医生'],
      '金钱/理财': ['钱', '赚钱', '花钱', '投资', '理财', '存款', '工资', '省钱']
    };

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          if (!this.currentSession.topics.includes(topic)) {
            this.currentSession.topics.push(topic);
          }
        }
      }
    }
  }

  analyzeInteraction(text) {
    const metrics = this.currentSession.interactionMetrics;
    const lowerText = text.toLowerCase();

    // 命令检测
    if (lowerText.startsWith('/') || lowerText.includes('帮我') || lowerText.includes('我要')) {
      metrics.commandsIssued++;
    }

    // 修改请求
    if (text.includes('不对') || text.includes('不是') || text.includes('修改') || text.includes('重新')) {
      metrics.modificationsRequested++;
    }

    // 确认
    if (text.includes('好的') || text.includes('可以') || text.includes('行') || text.includes('是') || text.includes('嗯')) {
      metrics.confirmationsGiven++;
    }

    // 拒绝
    if (text.includes('不要') || text.includes('不用') || text.includes('不行') || text.includes('算了')) {
      metrics.rejectionsGiven++;
    }

    // 澄清请求
    if (text.includes('什么意思') || text.includes('怎么') || text.includes('为什么') || text.includes('?)')) {
      metrics.clarificationsRequested++;
    }
  }

  // 检测决策模式
  trackDecision(message) {
    const text = message.content || message;

    // 犹豫词检测
    const hesitationPatterns = [
      { pattern: /可能|也许|大概|应该/g, type: 'probabilistic' },
      { pattern: /但是|不过|然而/g, type: 'conflicting' },
      { pattern: /犹豫|纠结|想不出/g, type: 'explicit_hesitation' },
      { pattern: /算了|随便|无所谓/g, type: 'avoidance' }
    ];

    hesitationPatterns.forEach(({ pattern, type }) => {
      if (pattern.test(text)) {
        this.currentSession.decisionPatterns.push({
          type,
          text: text.substring(0, 50),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  // 检测情感表达
  trackEmotionalExpression(message) {
    const text = message.content || message;
    const emotionPatterns = {
      '开心': ['开心', '高兴', '兴奋', '快乐', '幸福', '超开心', '太棒了'],
      '难过': ['难过', '伤心', '失落', '郁闷', '委屈'],
      '生气': ['生气', '气愤', '恼火', '讨厌', '烦'],
      '焦虑': ['焦虑', '担心', '害怕', '紧张', '不安'],
      '害羞': ['害羞', '不好意思', '脸红', '脸红'],
      '期待': ['期待', '希望', '盼望', '憧憬']
    };

    for (const [emotion, keywords] of Object.entries(emotionPatterns)) {
      if (keywords.some(k => text.includes(k))) {
        this.currentSession.emotionalExpressions.push({
          emotion,
          text: text.substring(0, 50),
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // 结束会话并保存
  endSession() {
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.duration = new Date(this.currentSession.endTime) - new Date(this.currentSession.startTime);

    db.saveSession(this.currentSession);

    const sessionData = this.currentSession;
    this.currentSession = {
      id: Date.now(),
      startTime: new Date().toISOString(),
      messages: [],
      languageMetrics: {},
      decisionPatterns: [],
      emotionalExpressions: [],
      topics: [],
      interactionMetrics: {}
    };
    this.initializeMetrics();

    return sessionData;
  }

  // 获取当前会话统计
  getSessionSummary() {
    const m = this.currentSession.languageMetrics;
    const i = this.currentSession.interactionMetrics;

    return {
      messageCount: m.totalMessages,
      wordCount: m.totalWords,
      topicDistribution: this.getTopicDistribution(),
      emotionalDistribution: this.getEmotionalDistribution(),
      interactionStyle: this.inferInteractionStyle(i),
      dominantSentiment: this.getDominantSentiment(m.sentimentWords)
    };
  }

  getTopicDistribution() {
    const total = this.currentSession.topics.length;
    if (total === 0) return {};

    const counts = {};
    this.currentSession.topics.forEach(t => {
      counts[t] = (counts[t] || 0) + 1;
    });

    const distribution = {};
    for (const [topic, count] of Object.entries(counts)) {
      distribution[topic] = (count / total * 100).toFixed(1) + '%';
    }
    return distribution;
  }

  getEmotionalDistribution() {
    const emotions = this.currentSession.emotionalExpressions.map(e => e.emotion);
    const counts = {};
    emotions.forEach(e => {
      counts[e] = (counts[e] || 0) + 1;
    });
    return counts;
  }

  getDominantSentiment(sentimentWords) {
    const { positive, negative, neutral } = sentimentWords;
    if (positive > negative && positive > neutral) return 'positive';
    if (negative > positive && negative > neutral) return 'negative';
    return 'neutral';
  }

  inferInteractionStyle(interactionMetrics) {
    const { commandsIssued, modificationsRequested, confirmationsGiven, rejectionsGiven } = interactionMetrics;

    const total = commandsIssued + modificationsRequested + confirmationsGiven + rejectionsGiven;
    if (total === 0) return 'neutral';

    const commandRatio = commandsIssued / total;
    const modifyRatio = modificationsRequested / total;
    const confirmRatio = confirmationsGiven / total;
    const rejectRatio = rejectionsGiven / total;

    if (commandRatio > 0.5) return 'directive';
    if (modifyRatio > 0.3) return 'perfectionist';
    if (confirmRatio > 0.5) return 'agreeable';
    if (rejectRatio > 0.3) return 'selective';
    return 'balanced';
  }
}

module.exports = new BehaviorTracker();

/**
 * persona-analyzer.js — 人格分析引擎
 * 基于行为数据（对话 + 浏览器浏览），分析用户的大五人格、依恋类型、爱情语言等
 */

const db = require('./db-manager');
const dataAggregator = require('./data-aggregator');

class PersonaAnalyzer {
  constructor() {
    // 大五人格权重参考
    this.bigFiveWeights = {
      openness: {
        indicators: ['questionCount', 'formalRatio'],
        highScore: { questionCount: 'high', formalRatio: 'low' },
        description: '好奇心和创造力'
      },
      conscientiousness: {
        indicators: ['modificationsRequested', 'commandsIssued'],
        description: '责任感和自律性'
      },
      extraversion: {
        indicators: ['emojiCount', 'totalMessages'],
        description: '外向性和社交活跃度'
      },
      agreeableness: {
        indicators: ['confirmationsGiven', 'rejectionsGiven'],
        description: '友好程度和合作性'
      },
      neuroticism: {
        indicators: ['negativeSentiment', 'hesitationCount'],
        description: '情绪稳定性'
      }
    };
  }

  // 主分析函数
  async analyze() {
    const sessions = db.loadAllSessions();

    if (sessions.length < 3) {
      return {
        status: 'insufficient_data',
        message: `当前只有 ${sessions.length} 个会话，至少需要 3 个会话才能生成准确的人格分析。请继续使用一段时间。`,
        readiness: sessions.length / 3
      };
    }

    // 聚合对话数据 + 加载浏览数据
    const aggregatedData = this.aggregateSessions(sessions);
    const browsingData = this.loadBrowsingProfile();

    const profile = this.buildProfile(aggregatedData, sessions.length, browsingData);

    // 保存分析结果
    db.saveUserProfile(profile);
    db.saveReport({
      type: 'persona_analysis',
      generatedAt: new Date().toISOString(),
      sessionCount: sessions.length,
      profile
    });

    return {
      status: 'complete',
      profile,
      readiness: 1,
      browsingDataLoaded: !!browsingData
    };
  }

  // 从 data-aggregator 获取浏览画像（无数据时返回 null，不阻塞分析）
  loadBrowsingProfile() {
    try {
      const aggregated = dataAggregator.aggregateAllData();
      return aggregated.browsing?.profile || null;
    } catch (e) {
      return null;
    }
  }

  aggregateSessions(sessions) {
    const aggregated = {
      totalMessages: 0,
      totalWords: 0,
      totalQuestions: 0,
      totalExclamations: 0,
      totalEmojis: 0,
      informalWordCount: 0,
      sentimentWords: { positive: 0, negative: 0, neutral: 0 },
      topicFrequency: {},
      emotionalFrequency: {},
      decisionPatterns: [],
      interactionMetrics: {
        totalCommands: 0,
        totalModifications: 0,
        totalConfirmations: 0,
        totalRejections: 0,
        totalClarifications: 0
      }
    };

    for (const session of sessions) {
      const m = session.languageMetrics || {};
      const i = session.interactionMetrics || {};

      aggregated.totalMessages += m.totalMessages || 0;
      aggregated.totalWords += m.totalWords || 0;
      aggregated.totalQuestions += m.questionCount || 0;
      aggregated.totalExclamations += m.exclamationCount || 0;
      aggregated.totalEmojis += m.emojiCount || 0;
      aggregated.informalWordCount += m.informalWords || 0;

      aggregated.sentimentWords.positive += m.sentimentWords?.positive || 0;
      aggregated.sentimentWords.negative += m.sentimentWords?.negative || 0;
      aggregated.sentimentWords.neutral += m.sentimentWords?.neutral || 0;

      aggregated.interactionMetrics.totalCommands += i.commandsIssued || 0;
      aggregated.interactionMetrics.totalModifications += i.modificationsRequested || 0;
      aggregated.interactionMetrics.totalConfirmations += i.confirmationsGiven || 0;
      aggregated.interactionMetrics.totalRejections += i.rejectionsGiven || 0;
      aggregated.interactionMetrics.totalClarifications += i.clarificationsRequested || 0;

      // 话题频率
      for (const topic of session.topics || []) {
        aggregated.topicFrequency[topic] = (aggregated.topicFrequency[topic] || 0) + 1;
      }

      // 情感频率
      for (const exp of session.emotionalExpressions || []) {
        aggregated.emotionalFrequency[exp.emotion] = (aggregated.emotionalFrequency[exp.emotion] || 0) + 1;
      }

      // 决策模式
      aggregated.decisionPatterns.push(...(session.decisionPatterns || []));
    }

    return aggregated;
  }

  buildProfile(aggregated, sessionCount, browsingData = null) {
    const { bigFive, bigFiveDescription } = this.calculateBigFive(aggregated);
    const { attachmentStyle, attachmentDescription } = this.detectAttachmentStyle(aggregated);
    const loveLanguages = this.detectLoveLanguages(aggregated);
    const intimacyStyle = this.detectIntimacyStyle(aggregated);
    const valuesPriority = this.estimateValuesPriority(aggregated, browsingData);
    const hiddenPreferences = this.estimateHiddenPreferences(aggregated, browsingData);

    return {
      version: '1.1',
      analyzedAt: new Date().toISOString(),
      sessionCount,
      bigFive,
      bigFiveDescription,
      attachmentStyle,
      attachmentDescription,
      loveLanguages,
      intimacyStyle,
      valuesPriority,
      hiddenPreferences,
      communicationStyle: this.detectCommunicationStyle(aggregated),
      relationshipPattern: this.detectRelationshipPattern(aggregated, browsingData),
      // 嵌入浏览数据快照（用于恋人生成）
      browsingSnapshot: browsingData ? {
        topCategories: this.getTopBrowsingCategories(browsingData),
        topInterests: this.getTopBrowsingInterests(browsingData),
        browsingStyle: browsingData.browsingStyle,
        dominantDomain: browsingData.dominantDomain,
        dominantDomainRatio: browsingData.dominantDomainRatio
      } : null
    };
  }

  calculateBigFive(data) {
    const m = data.interactionMetrics;
    const total = m.totalCommands + m.totalModifications + m.totalConfirmations + m.totalRejections;

    // 开放性：从问问题频率和正式程度推断
    const questionRatio = data.totalQuestions / Math.max(data.totalMessages, 1);
    const informalRatio = data.informalWordCount / Math.max(data.totalWords, 1);
    const openness = Math.min(0.95, 0.3 + questionRatio * 3 + informalRatio * 2);

    // 尽责性：从修改频率和命令频率推断
    const modifyRatio = m.totalModifications / Math.max(total, 1);
    const commandRatio = m.totalCommands / Math.max(total, 1);
    const conscientiousness = Math.min(0.95, 0.4 + modifyRatio * 1.5 + commandRatio * 0.5);

    // 外向性：从 emoji 数量和消息频率推断
    const emojiRatio = data.totalEmojis / Math.max(data.totalMessages, 1);
    const avgWords = data.totalWords / Math.max(data.totalMessages, 1);
    const extraversion = Math.min(0.95, 0.3 + emojiRatio * 5 + avgWords * 0.01);

    // 宜人性：从确认 vs 拒绝比例推断
    const confirmRatio = m.totalConfirmations / Math.max(total, 1);
    const rejectRatio = m.totalRejections / Math.max(total, 1);
    const agreeableness = Math.min(0.95, 0.5 + confirmRatio * 2 - rejectRatio * 3);

    // 神经质：从负面情绪词和犹豫模式推断
    const negativeRatio = data.sentimentWords.negative / Math.max(
      data.sentimentWords.positive + data.sentimentWords.negative + data.sentimentWords.neutral, 1
    );
    const hesitationCount = data.decisionPatterns.filter(p => p.type === 'explicit_hesitation').length;
    const neuroticism = Math.min(0.95, 0.2 + negativeRatio * 2 + hesitationCount * 0.1);

    return {
      bigFive: {
        openness: parseFloat(openness.toFixed(2)),
        conscientiousness: parseFloat(conscientiousness.toFixed(2)),
        extraversion: parseFloat(extraversion.toFixed(2)),
        agreeableness: parseFloat(agreeableness.toFixed(2)),
        neuroticism: parseFloat(neuroticism.toFixed(2))
      },
      bigFiveDescription: {
        openness: this.describeOpenness(openness),
        conscientiousness: this.describeConscientiousness(conscientiousness),
        extraversion: this.describeExtraversion(extraversion),
        agreeableness: this.describeAgreeableness(agreeableness),
        neuroticism: this.describeNeuroticism(neuroticism)
      }
    };
  }

  describeOpenness(score) {
    if (score > 0.7) return '你是一个高度开放的人，充满好奇心，喜欢探索新事物和想法。你对艺术、文化和抽象思维有浓厚兴趣。';
    if (score > 0.4) return '你有一定的开放性，愿意尝试新事物，但也保持着务实的态度。';
    return '你更倾向于保守和稳定，喜欢熟悉的模式和可预见的结果。';
  }

  describeConscientiousness(score) {
    if (score > 0.7) return '你是一个高度负责的人，做事有条理、注重细节、有很强的自律性。';
    if (score > 0.4) return '你有较好的责任感，会努力完成任务，但偶尔也会有拖延的倾向。';
    return '你更倾向于随性而为，不喜欢被规则束缚，追求自由灵活的生活方式。';
  }

  describeExtraversion(score) {
    if (score > 0.7) return '你是一个外向的人，喜欢社交、充满活力、在人群中感到自在。你善于与人交流。';
    if (score > 0.4) return '你有外向的一面，但也能享受独处的时间。在熟悉的环境中更活跃。';
    return '你是一个内向的人，更喜欢小圈子或独处，在深入交流中更能展现真实的自己。';
  }

  describeAgreeableness(score) {
    if (score > 0.7) return '你是一个高度宜人的人，善良、体贴、愿意帮助他人、善于合作。';
    if (score > 0.4) return '你有一定的合作精神，但也有自己的原则和底线。';
    return '你更注重实际和效率，有时可能会显得直接或冷漠，但这不代表你不关心他人。';
  }

  describeNeuroticism(score) {
    if (score > 0.7) return '你可能比一般人更容易感到压力和焦虑，对情绪反应比较敏感。';
    if (score > 0.4) return '你的情绪相对稳定，能较好地应对压力，但偶尔也会感到不安。';
    return '你是一个情绪非常稳定的人，很少被情绪左右，能保持冷静和理性。';
  }

  detectAttachmentStyle(data) {
    const m = data.interactionMetrics;
    const sentimentWords = data.sentimentWords;
    const total = (m?.totalConfirmations || 0) + (m?.totalRejections || 0) + (m?.totalClarifications || 0);

    const rejectionRatio = (m?.totalRejections || 0) / Math.max(total, 1);
    const clarificationRatio = (m?.totalClarifications || 0) / Math.max(total, 1);
    const negativeSentiment = (sentimentWords?.negative || 0) > (sentimentWords?.positive || 0);

    // 安全型：高确认、低拒绝、适度提问
    if ((m?.totalConfirmations || 0) / Math.max(total, 1) > 0.4 && rejectionRatio < 0.2) {
      return {
        attachmentStyle: 'secure',
        attachmentDescription: '你有安全型的依恋风格，能够在亲密关系中保持健康的依赖和独立平衡。你信任伴侣，也信任自己的价值。'
      };
    }

    // 焦虑型：高提问、高确认、情绪化表达
    if (clarificationRatio > 0.3 && negativeSentiment) {
      return {
        attachmentStyle: 'anxious',
        attachmentDescription: '你有焦虑型的依恋倾向，容易在关系中担心被抛弃或不被重视。你需要学会更好地安抚自己的不安。'
      };
    }

    // 回避型：低确认、高拒绝、独立倾向
    if (rejectionRatio > 0.3) {
      return {
        attachmentStyle: 'avoidant',
        attachmentDescription: '你有回避型的依恋倾向，倾向于在关系中保持距离，避免过于亲密。这可能源于早期的经历。'
      };
    }

    // 恐惧型：矛盾混合
    return {
      attachmentStyle: 'fearful',
      attachmentDescription: '你有恐惧型的依恋风格，既渴望亲密又害怕被伤害。这种矛盾可能会影响你建立稳定的亲密关系。'
    };
  }

  detectLoveLanguages(data) {
    const topics = data.topicFrequency;
    const emotions = data.emotionalFrequency;
    const words = data.totalWords;

    const languages = {
      words: { score: 0, evidence: [] },
      quality_time: { score: 0, evidence: [] },
      gifts: { score: 0, evidence: [] },
      acts: { score: 0, evidence: [] },
      touch: { score: 0, evidence: [] }
    };

    // 言语肯定：从情感表达和确认行为推断
    if (emotions.positive > emotions.negative) {
      languages.words.score += 0.3;
      languages.words.evidence.push('你经常表达正面情感');
    }
    if (topics['感情/恋爱']) {
      languages.words.score += 0.2;
      languages.words.evidence.push('你关注感情话题');
    }

    // 优质时间：从话题类型推断
    if (topics['社交/友谊'] || topics['娱乐/兴趣']) {
      languages.quality_time.score += 0.3;
      languages.quality_time.evidence.push('你重视社交和兴趣活动');
    }

    // 礼物：从送礼相关话题推断（较少）
    if (topics['金钱/理财']) {
      languages.gifts.score += 0.2;
      languages.gifts.evidence.push('你对理财有所关注');
    }

    // 服务行为：从责任感推断
    if (data.interactionMetrics.totalCommands > 20) {
      languages.acts.score += 0.2;
      languages.acts.evidence.push('你习惯通过指令来表达需求');
    }

    // 身体接触：从情感表达的热情程度推断
    if (emotions.positive > 3) {
      languages.touch.score += 0.2;
      languages.touch.evidence.push('你情感表达较为热情');
    }

    // 排序并返回
    const sorted = Object.entries(languages)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 3)
      .map(([lang]) => lang);

    const descriptions = {
      words: '言语肯定 — 你重视语言表达和情感交流',
      quality_time: '优质时间 — 你重视陪伴和共同经历',
      gifts: '收到礼物 — 你重视心意的象征',
      acts: '服务行为 — 你重视实际行动',
      touch: '身体接触 — 你重视亲密的肢体接触'
    };

    return {
      primary: sorted[0] || 'words',
      secondary: sorted.slice(0, 2),
      all: sorted.map(l => descriptions[l])
    };
  }

  detectIntimacyStyle(data) {
    const m = data.interactionMetrics;
    const hesitationCount = data.decisionPatterns.filter(p =>
      p.type === 'explicit_hesitation' || p.type === 'conflicting'
    ).length;

    const emotionalDepth = data.sentimentWords.positive / Math.max(
      data.sentimentWords.positive + data.sentimentWords.negative + 1, 1
    );

    const personalSpace = m.totalRejections / Math.max(
      m.totalConfirmations + m.totalRejections, 1
    );

    let conflictApproach;
    if (hesitationCount > 5) {
      conflictApproach = 'avoid';
    } else if (m.totalRejections > m.totalConfirmations * 0.5) {
      conflictApproach = 'confront';
    } else {
      conflictApproach = 'compromise';
    }

    let commitmentTimeline;
    if (hesitationCount > 3) {
      commitmentTimeline = 'long_term';
    } else if (hesitationCount < 1 && m.totalConfirmations > 10) {
      commitmentTimeline = 'quick';
    } else {
      commitmentTimeline = 'gradual';
    }

    return {
      emotional_depth: parseFloat(emotionalDepth.toFixed(2)),
      personal_space: parseFloat(Math.min(0.9, personalSpace + 0.3).toFixed(2)),
      conflict_approach: conflictApproach,
      commitment_timeline: commitmentTimeline
    };
  }

  estimateValuesPriority(data, browsingData = null) {
    const topics = data.topicFrequency;
    const sortedTopics = Object.entries(topics)
      .sort((a, b) => b[1] - a[1])
      .map(([topic]) => topic);

    const topicToValue = {
      '工作/事业': 'career',
      '学习/成长': 'growth',
      '感情/恋爱': 'relationship',
      '家庭/亲情': 'family',
      '社交/友谊': 'friendship',
      '娱乐/兴趣': 'hobby',
      '金钱/理财': 'financial',
      '健康/生活': 'health',
      '科技/数码': 'technology'
    };

    let base = sortedTopics.map(t => topicToValue[t] || t);

    // 浏览数据补充：按浏览时长加权的分类优先级
    if (browsingData && browsingData.categories) {
      const browsingValues = this.browsingCategoriesToValues(browsingData.categories);
      // 合并：对话优先度 + 浏览兴趣，浏览优先级较高的排在前面
      browsingValues.forEach(v => {
        if (!base.includes(v)) base.push(v);
      });
    }

    return base;
  }

  // 辅助：将浏览主分类映射为价值观优先级
  browsingCategoriesToValues(categories) {
    const catToValue = {
      knowledge: 'growth',
      tech: 'technology',
      video: 'hobby',
      anime: 'hobby',
      movie: 'hobby',
      gaming: 'hobby',
      social: 'friendship',
      shopping: 'financial',
      news: 'growth',
      novel: 'growth',
      finance: 'financial',
      sports: 'health'
    };
    const sorted = Object.entries(categories || {})
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => catToValue[cat] || 'hobby');
    return [...new Set(sorted)];
  }

  estimateHiddenPreferences(data, browsingData = null) {
    const m = data.interactionMetrics;

    let idealAgeRange = [22, 30];
    if (m.totalRejections > 5) {
      idealAgeRange = [24, 32]; // 偏成熟
    }

    let idealPersonalityType = 'balanced';
    if (m.totalConfirmations > m.totalRejections * 2) {
      idealPersonalityType = 'warm_supportive';
    } else if (m.totalRejections > m.totalConfirmations) {
      idealPersonalityType = 'independent_confident';
    }

    // 从浏览数据推断审美偏好和喜欢的类型
    let aestheticPreference = null;
    let lifeStyleHint = null;
    if (browsingData && browsingData.interests) {
      const interests = browsingData.interests;
      // 审美偏好：御姐型 vs 可爱型
      if ((interests.mature_feminine || 0) > (interests.cute || 0) * 1.5) {
        aestheticPreference = 'mature_feminine';
      } else if ((interests.cute || 0) > (interests.mature_feminine || 0) * 1.5) {
        aestheticPreference = 'cute';
      }
      // 生活方式推断
      if (interests.fitness > 3) lifeStyleHint = 'active';
      else if (interests.travel > 3) lifeStyleHint = 'travel_oriented';
      else if (interests.gaming_content > 3) lifeStyleHint = 'indoor_hobby';
    }

    return {
      ideal_age_range: idealAgeRange,
      ideal_personality_type: idealPersonalityType,
      aesthetic_preference: aestheticPreference,
      lifestyle_hint: lifeStyleHint,
      dealbreakers: [] // 暂不推断，需要更多数据
    };
  }

  detectCommunicationStyle(data) {
    const m = data.interactionMetrics;
    const avgWords = data.totalWords / Math.max(data.totalMessages, 1);

    let style;
    if (avgWords > 50 && m.totalQuestions > 5) {
      style = 'detailed_expressive';
    } else if (avgWords < 20 && m.totalCommands > 5) {
      style = 'direct_efficient';
    } else if (data.totalEmojis > 5) {
      style = 'playful_emoji';
    } else {
      style = 'balanced';
    }

    return style;
  }

  detectRelationshipPattern(data, browsingData = null) {
    const topics = data.topicFrequency;
    const hesitationCount = data.decisionPatterns.filter(p => p.type === 'explicit_hesitation').length;

    let pattern;
    if (topics['感情/恋爱'] && hesitationCount > 3) {
      pattern = 'cautious_explorer';
    } else if (topics['感情/恋爱'] && hesitationCount < 2) {
      pattern = 'confident_pursuer';
    } else if (!topics['感情/恋爱']) {
      pattern = 'relationship_curious';
    } else {
      pattern = 'balanced_observer';
    }

    return pattern;
  }

  // 从浏览数据中提取 Top N 分类（按占比排序）
  getTopBrowsingCategories(browsingData, n = 5) {
    const cats = browsingData?.categories || {};
    return Object.entries(cats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([cat, pct]) => ({ category: cat, percentage: pct }));
  }

  // 从浏览数据中提取 Top N 兴趣标签（按加权得分排序）
  getTopBrowsingInterests(browsingData, n = 8) {
    const interests = browsingData?.interests || {};
    return Object.entries(interests)
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([tag, score]) => ({ tag, score: parseFloat(score.toFixed(1)) }));
  }
}

module.exports = new PersonaAnalyzer();

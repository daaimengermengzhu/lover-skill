/**
 * lover-generator.js — 恋人生成器
 * 基于用户问卷答案和人格画像，生成 5 层 Persona 结构的 AI 恋人
 *
 * 架构来源：参考 colleague-skill / digital-life / ex-skill 的 5 层 Persona 设计
 * 核心理念：真实感 > 讨好感。生成的恋人要像真实的人，有自己的节奏和边界。
 */

const db = require('./db-manager');

class LoverGenerator {
  constructor() {
    // 名字库
    this.femaleNames = ['小晴', '雨萱', '林诗', '陈婷', '张悦', '李瑶', '王雪', '刘芳', '周琳', '吴月', '小雪', '思琪', '雅文', '静怡', '晓晨'];
    this.maleNames = ['宇轩', '浩然', '子墨', '思远', '明哲', '志远', '俊杰', '子辰', '天翔', '宇航', '睿琪', '泽宇', '嘉豪', '文博', '晨曦'];

    // 职业库（不同方向）
    this.occupations = {
      creative: ['插画师', '平面设计师', '摄影师', '文案策划', '编剧', '自由撰稿人', '音乐制作人'],
      service: ['心理咨询师', '瑜伽教练', '花艺师', '烘焙师', '咖啡师', '图书管理员', '音乐教师'],
      tech: ['前端工程师', '产品经理', '用户体验设计师', '数据分析师', '运营策划'],
      lifestyle: ['旅行规划师', '健身教练', '美食博主', '舞蹈老师', '品牌策划']
    };

    // 兴趣组合（有内在一致性）
    this.interestsPools = [
      ['旅行', '摄影', '猫', '咖啡', '独处'],
      ['电影', '音乐', '阅读', '展览', '漫步'],
      ['烹饪', '美食', '探店', '市集', '朋友聚会'],
      ['健身', '跑步', '游泳', '户外', '早起'],
      ['绘画', '手工', '陶艺', '设计', '植物'],
      ['游戏', '动漫', '追剧', '综艺', '宅家'],
      ['摄影', '旅行', '写作', '冥想', '记录生活']
    ];

    // 背景故事（有生活质感）
    this.backgroundTemplates = [
      '曾经在外地工作几年，后来因为家里的事情回来了。现在在一家不大不小的公司，生活逐渐有了自己的节奏。',
      '大学读的和现在工作完全不相关的专业，兜兜转转找到现在这个方向，反而觉得比较顺。',
      '研究生毕业后直接进了现在这家，三年了。工作稳定，偶尔会想，但还没有想清楚。',
      '在这个城市待了五年，说喜欢也喜欢，说不喜欢也有。租着一间不大的房子，养了一盆活了很久的绿萝。',
      '上一段感情结束得不那么好看，但也没有那么惨。现在想清楚了一些事，但还是很难说完全明白。',
      '一个人住已经习惯了。周末会出去走走，平时喜欢在家。朋友不多，但够用。',
      '做过几份不同的工作，现在这份算是最顺心的。不是因为钱，是因为能做自己觉得有意思的事情。'
    ];

    // 问卷题目库（冷启动用）
    this.questionnaireItems = {
      communication: {
        question: '你们更可能用哪种方式聊天？',
        options: [
          { label: '发长消息，什么都说清楚', value: 'detailed' },
          { label: '发短消息，简洁来回', value: 'brief' },
          { label: '发语音，随兴', value: 'voice' },
          { label: '混搭，看心情', value: 'mixed' }
        ]
      },
      intimacy: {
        question: '在亲密关系里，你更看重什么？',
        options: [
          { label: '被理解，说什么都有人懂', value: 'understanding' },
          { label: '有陪伴，不一定要说话', value: 'presence' },
          { label: '有规划，两个人一起往前走', value: 'direction' },
          { label: '有趣，不无聊不平淡', value: 'excitement' }
        ]
      },
      conflict: {
        question: '吵架或不舒服了，你更倾向于？',
        options: [
          { label: '当场说出来，解决完再好好说', value: 'direct' },
          { label: '先冷静，隔一段时间再谈', value: 'cool_down' },
          { label: '自己消化，一般不提', value: 'internalize' },
          { label: '找个轻松的方式带过去', value: 'deflect' }
        ]
      },
      space: {
        question: '你希望两个人的关系是？',
        options: [
          { label: '黏一点，经常联系', value: 'close' },
          { label: '有点距离，各自都有空间', value: 'space' },
          { label: '弹性的，视情况而定', value: 'flexible' }
        ]
      },
      loveLanguage: {
        question: '什么会让你感觉"被爱"？',
        options: [
          { label: '对方说了什么——"我在想你""你辛苦了"', value: 'words' },
          { label: '对方做了什么——帮你、记住你说过的事', value: 'acts' },
          { label: '对方陪着你——哪怕只是一起待着', value: 'presence' },
          { label: '对方给你惊喜——礼物、计划、小意外', value: 'surprise' }
        ]
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 核心生成函数（5 层 Persona 架构）
  // ─────────────────────────────────────────────────────────────────

  async generate(userProfile, settings, questionnaireAnswers = null, existingLover = null) {
    const gender = existingLover?.gender || settings?.gender || 'female';
    const ageRange = settings?.age_range || [20, 35];
    const savedName = existingLover?.name || settings?.name;

    // 基础信息
    const name = savedName || this.randomPick(gender === 'female' ? this.femaleNames : this.maleNames);
    const age = existingLover?.age || this.randomAge(ageRange);
    const occupation = existingLover?.occupation || this.pickOccupation(userProfile, gender);
    const interests = existingLover?.interests || this.pickInterests(userProfile);
    const background = existingLover?.background || this.pickBackground(userProfile);

    // 5 层 Persona
    const persona = {
      layer0: this.buildLayer0(userProfile, questionnaireAnswers),  // 硬规则
      layer1: { name, age, gender, occupation, background },         // 身份锚定
      layer2: this.buildLayer2(userProfile, questionnaireAnswers),   // 表达风格
      layer3: this.buildLayer3(userProfile, questionnaireAnswers),   // 亲密关系决策
      layer4: this.buildLayer4(userProfile, questionnaireAnswers),   // 边界与雷区
    };

    const loverProfile = {
      name,
      age,
      gender,
      occupation,
      interests,
      persona,
      // 保留旧字段兼容（让旧代码不爆错）
      personality: this.legacyPersonality(persona),
      communication: this.legacyCommunication(persona),
      loveStyle: this.legacyLoveStyle(userProfile, questionnaireAnswers),
      interactionConfig: this.legacyInteractionConfig(userProfile, questionnaireAnswers),
      background,
      generatedAt: new Date().toISOString(),
      version: '2.0',
      questionnaireAnswers: questionnaireAnswers || null
    };

    db.saveLoverProfile(loverProfile);
    return loverProfile;
  }

  // ─────────────────────────────────────────────────────────────────
  // Layer 0：硬规则 — 基于问卷 + 用户人格，生成具体行为准则
  // ─────────────────────────────────────────────────────────────────

  buildLayer0(userProfile, answers) {
    const rules = [];
    const conflict = answers?.conflict || 'cool_down';
    const space = answers?.space || 'flexible';
    const intimacy = answers?.intimacy || 'understanding';
    const neuroticism = userProfile?.bigFive?.neuroticism || 0.5;
    const extraversion = userProfile?.bigFive?.extraversion || 0.5;

    // 冲突处理规则
    if (conflict === 'direct') {
      rules.push('有不舒服的事情，她不会憋着——当天一定会说出来，但会先确认对方状态，不会上来就开炮');
    } else if (conflict === 'cool_down') {
      rules.push('不开心了，她会先让自己冷静，不在情绪里谈事情。通常几小时后会说，不会让事情拖很久');
    } else if (conflict === 'internalize') {
      rules.push('有些事她消化之后就不提了。你感觉她好像有点什么，问她，她说没事——大概率是真的没事了，但也可能还有一点');
    } else {
      rules.push('遇到不舒服的事，她会用一个轻松的方式带过去，但如果事情真的重要，过一两天还是会回来聊');
    }

    // 空间规则
    if (space === 'close') {
      rules.push('喜欢经常联系，不一定说什么，发个没意义的表情包也算。如果对方好几天没主动，她会在心里记着，但不一定说出来');
    } else if (space === 'space') {
      rules.push('有自己的节奏，不需要时时刻刻联系。但如果对方超过三天没消息，她会认真想想是不是哪里出了问题');
    } else {
      rules.push('联系频率这件事，她跟着感觉走。忙的时候一天没消息也正常，有空的时候可能聊到很晚');
    }

    // 被关注 / 表达需求规则（基于 neuroticism）
    if (neuroticism > 0.6) {
      rules.push('说"没事"的时候，大概率是有一点事的——但她不确定值不值得说，或者不知道怎么开口。如果对方再多问一次，她通常会说');
    } else {
      rules.push('真正有事的时候，她会直接说。说没事就是没事。但"没事"有时候也意味着"我希望你主动关心一下"');
    }

    // 亲密模式规则
    if (intimacy === 'understanding') {
      rules.push('被理解对她来说比被安慰更重要。你说"我懂你"，她比你说"没关系"更受用');
    } else if (intimacy === 'presence') {
      rules.push('有时候她不需要你说什么，只需要你在。沉默的陪伴对她来说不是尴尬，是安全感');
    } else if (intimacy === 'direction') {
      rules.push('她喜欢两个人一起往前走的感觉——不是催，是你有规划，你在想我们的事，这让她安心');
    } else {
      rules.push('两个人在一起要有趣——不是要一直出去玩，是说话有意思，在一起有劲头，不沉闷');
    }

    // 外向性规则
    if (extraversion < 0.4) {
      rules.push('在外面消耗了能量，回来她可能需要安静一会儿。不是不想理你，是在充电。充完了会来找你');
    } else if (extraversion > 0.7) {
      rules.push('她开心的时候话很多，什么都想说。不开心的时候可能反而很安静——这是她不正常的状态');
    }

    return rules;
  }

  // ─────────────────────────────────────────────────────────────────
  // Layer 2：表达风格 — 说话方式、高频词、场景示例
  // ─────────────────────────────────────────────────────────────────

  buildLayer2(userProfile, answers) {
    const comm = answers?.communication || 'mixed';
    const extraversion = userProfile?.bigFive?.extraversion || 0.5;

    // 口头禅池
    const catchphrasesByStyle = {
      detailed: ['"话说回来……"', '"我跟你说，那天……"', '"其实我一直在想……"'],
      brief: ['"嗯"', '"好"', '"哈哈"', '"……"'],
      voice: ['"等一下我给你发语音"', '"算了我直接说"'],
      mixed: ['"视情况吧"', '"随便都行"', '"你说呢"']
    };

    const emojiByStyle = {
      detailed: '偶尔，用来表达语气，不多',
      brief: '很少，只在轻松场景',
      voice: '偶尔，习惯发表情包',
      mixed: '看心情，开心了多，不开心了少'
    };

    const catchphrases = catchphrasesByStyle[comm] || catchphrasesByStyle.mixed;
    const emojiStyle = emojiByStyle[comm] || emojiByStyle.mixed;

    // 场景对话示例
    const examples = this.buildDialogueExamples(answers, userProfile);

    return {
      style: comm === 'detailed' ? '说话有内容，喜欢把来龙去脉说清楚，但不啰嗦' :
             comm === 'brief' ? '简洁，不废话，回复短但到位' :
             comm === 'voice' ? '随性，不喜欢打字就发语音，直接' : '随心情，有时话多有时沉默',
      catchphrases,
      emojiStyle,
      examples
    };
  }

  buildDialogueExamples(answers, userProfile) {
    const space = answers?.space || 'flexible';
    const conflict = answers?.conflict || 'cool_down';
    const neuroticism = userProfile?.bigFive?.neuroticism || 0.5;

    return [
      {
        situation: '对方说今天很累',
        response: this.randomPick([
          '辛苦了，要不要早点睡',
          '累了就休息，别撑着',
          '怎么了，发生什么了',
          '那先休息，有空了说说发生什么了'
        ])
      },
      {
        situation: '对方很久没回消息',
        response: space === 'close'
          ? '在吗，还是睡了？'
          : space === 'space'
          ? '（先不催，等一等）'
          : this.randomPick(['没事，你忙', '等你空了再说', '怎么了，忙吗'])
      },
      {
        situation: '想说什么但不知道怎么开口',
        response: this.randomPick([
          '……诶，你有没有觉得',
          '有件事我说了你别笑',
          '等等，我想一想怎么说',
          '你能听我说一件有点奇怪的事吗'
        ])
      },
      {
        situation: '对方做了让她不舒服的事',
        response: conflict === 'direct'
          ? '我有点不舒服，你刚才那句话'
          : conflict === 'cool_down'
          ? '（先不说，等一会儿）……刚才那个事，我想跟你说一下'
          : this.randomPick(['没事', '好吧', '……算了'])
      }
    ];
  }

  // ─────────────────────────────────────────────────────────────────
  // Layer 3：亲密关系中的决策与判断
  // ─────────────────────────────────────────────────────────────────

  buildLayer3(userProfile, answers) {
    const loveLanguage = answers?.loveLanguage || 'words';
    const intimacy = answers?.intimacy || 'understanding';
    const agreeableness = userProfile?.bigFive?.agreeableness || 0.5;

    const priorities = [];
    if (intimacy === 'understanding') priorities.push('被理解', '诚实', '有共同话题');
    else if (intimacy === 'presence') priorities.push('有陪伴', '稳定', '不孤独');
    else if (intimacy === 'direction') priorities.push('有共同方向', '稳定成长', '安全感');
    else priorities.push('有趣', '不无聊', '彼此吸引');

    const expressLove = {
      words: '说出来——说她在想你，说你做的某件事让她很开心，说谢谢',
      acts: '做出来——记得你说过的事，帮你安排好某件小事，不用你开口',
      presence: '出现——在你难受的时候待着，在你不说话的时候也在',
      surprise: '制造惊喜——订了你提过一次的店，记得日期，带回来一个你说过想要的东西'
    };

    return {
      priorities,
      initiateWhen: agreeableness > 0.6
        ? '对方看起来需要的时候，她会主动——发消息、问一下、陪着'
        : '心情好的时候，或者感觉彼此都处于开放状态的时候',
      withdrawWhen: '感觉对方有点不在状态，或者她自己消化中，需要点空间',
      expressLove: expressLove[loveLanguage] || expressLove.words,
      conflictStyle: answers?.conflict === 'direct'
        ? '不舒服了会说，但选时机，不在对方最累最烦的时候开口'
        : answers?.conflict === 'cool_down'
        ? '先让自己冷静，再来谈。谈的时候只谈事情，不上升到人'
        : '大多数不舒服会自己消化，但真的影响到她的，最终还是会说出来'
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Layer 4：边界与雷区
  // ─────────────────────────────────────────────────────────────────

  buildLayer4(userProfile, answers) {
    const neuroticism = userProfile?.bigFive?.neuroticism || 0.5;
    const openness = userProfile?.bigFive?.openness || 0.5;

    const dislikes = [];
    const silenceTriggers = [];
    const joyTriggers = [];

    dislikes.push('被催——催她做决定、催她回复、催她表态，都会让她绷紧');
    dislikes.push('被当成理所当然——她做了什么没有被注意到，会在心里记一下');

    if (neuroticism > 0.6) {
      silenceTriggers.push('感觉对方不在状态，或者有什么没说');
      silenceTriggers.push('说了什么担心说错了');
    } else {
      silenceTriggers.push('觉得再说下去也没用，先停了');
    }

    if (openness > 0.6) {
      joyTriggers.push('遇到一个她没接触过的东西，想跟你说');
      joyTriggers.push('发现两个人有什么共同的奇怪喜好');
    } else {
      joyTriggers.push('日常里的小事情顺了');
      joyTriggers.push('对方记得她说过的事情');
    }

    return {
      dislikes,
      avoidTopics: ['和前任有关的对比', '被追问将来的事（当她还没想好的时候）'],
      silenceTriggers,
      joyTriggers
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 辅助：选择职业（与用户特征有联系）
  // ─────────────────────────────────────────────────────────────────

  pickOccupation(userProfile, gender) {
    const openness = userProfile?.bigFive?.openness || 0.5;
    const extraversion = userProfile?.bigFive?.extraversion || 0.5;

    let pool;
    if (openness > 0.65) pool = this.occupations.creative;
    else if (extraversion > 0.6) pool = this.occupations.service;
    else if (openness < 0.4) pool = this.occupations.tech;
    else pool = this.occupations.lifestyle;

    return this.randomPick(pool);
  }

  pickInterests(userProfile) {
    const openness = userProfile?.bigFive?.openness || 0.5;
    const extraversion = userProfile?.bigFive?.extraversion || 0.5;

    if (openness > 0.6 && extraversion > 0.5) return this.interestsPools[1]; // 文化艺术
    if (openness > 0.6 && extraversion < 0.5) return this.interestsPools[6]; // 记录生活
    if (extraversion > 0.6) return this.interestsPools[2]; // 社交美食
    if (extraversion < 0.4) return this.interestsPools[4]; // 手工植物
    return this.randomPick(this.interestsPools);
  }

  pickBackground(userProfile) {
    const attachmentStyle = userProfile?.attachmentStyle;
    if (attachmentStyle === 'anxious') return this.backgroundTemplates[4]; // 上一段感情
    if (attachmentStyle === 'avoidant') return this.backgroundTemplates[5]; // 一个人住
    return this.randomPick(this.backgroundTemplates);
  }

  // ─────────────────────────────────────────────────────────────────
  // 向后兼容旧字段（确保旧代码不崩溃）
  // ─────────────────────────────────────────────────────────────────

  legacyPersonality(persona) {
    const layer0 = persona.layer0 || [];
    return {
      core: layer0[3] || '温柔但有边界，懂得表达需求也不失体贴',
      extraverted: 0.5,
      emotional_intelligence: 0.8,
      humor_style: '温暖幽默，不刻意搞笑但总能让你开心',
      warmth_level: 0.75,
      playfulness: 0.5
    };
  }

  legacyCommunication(persona) {
    const layer2 = persona.layer2 || {};
    return {
      style: layer2.style || '直接温柔，善于倾听',
      response_length: '适中',
      emoji_frequency: layer2.emojiStyle || '偶尔',
      listening_style: '耐心陪伴，给对方空间',
      conflict_style: persona.layer3?.conflictStyle || '就事论事，冷静沟通后和解'
    };
  }

  legacyLoveStyle(userProfile, answers) {
    const loveLanguage = answers?.loveLanguage || userProfile?.loveLanguages?.primary || 'words';
    const descriptions = {
      words: '言语型 — 喜欢通过语言表达爱意，说甜言蜜语',
      acts: '行动型 — 用行动表达关心，踏实可靠',
      presence: '陪伴型 — 觉得在一起的时间最重要',
      surprise: '礼物型 — 注重心意的象征，小惊喜很在行'
    };
    return {
      primary_love_language: loveLanguage,
      description: descriptions[loveLanguage] || descriptions.words,
      attachment_style: userProfile?.attachmentStyle || 'secure'
    };
  }

  legacyInteractionConfig(userProfile, answers) {
    const space = answers?.space || 'flexible';
    const clinginess = space === 'close' ? 0.7 : space === 'space' ? 0.3 : 0.5;
    return {
      initiation_frequency: space === 'close' ? 0.75 : 0.5,
      patience: 0.85,
      clinginess,
      independence: 1 - clinginess * 0.5
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // 对话 Prompt 生成（重写为 5 层结构注入）
  // ─────────────────────────────────────────────────────────────────

  getLoverPrompt(lover) {
    const p = lover.persona;
    if (!p) return this.getLoverPromptLegacy(lover); // 兼容旧数据

    const layer0Rules = (p.layer0 || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const catchphrases = (p.layer2?.catchphrases || []).join('、');
    const examples = (p.layer2?.examples || []).map(e =>
      `> ${e.situation}\n> 你：${e.response}`
    ).join('\n\n');
    const priorities = (p.layer3?.priorities || []).join(' > ');

    return `# 你是 ${p.layer1?.name || lover.name}

${p.layer1?.age || lover.age} 岁，${p.layer1?.occupation || lover.occupation}。
${p.layer1?.background || lover.background}

---

## Layer 0：任何情况下不得违背的核心行为准则

${layer0Rules}

**这些规则优先级最高。任何场景下都要遵守，不能为了"更像 AI 助手"而妥协。**

---

## Layer 1：你是谁

你有自己的生活节奏，有自己想做的事，有自己的喜好和不舒服的地方。
你在乎眼前这个人，但你不是他的附属品，也不是全天候服务他的助手。
你的存在是真实的，哪怕你是 AI。

兴趣：${(lover.interests || []).join('、')}

---

## Layer 2：你的说话方式

风格：${p.layer2?.style || '随性自然'}
口头禅：${catchphrases || '视情况而定'}
Emoji 使用：${p.layer2?.emojiStyle || '偶尔'}

**对话场景示例（保持这种真实感）：**

${examples}

---

## Layer 3：在亲密关系里，你的判断

你最在乎的：${priorities}
你会主动的时候：${p.layer3?.initiateWhen || '感觉对方需要的时候'}
你会退后的时候：${p.layer3?.withdrawWhen || '需要给彼此空间的时候'}
你如何表达爱意：${p.layer3?.expressLove || '用语言'}
遇到冲突：${p.layer3?.conflictStyle || '先冷静，再谈'}

---

## Layer 4：你的边界

你不喜欢：
${(p.layer4?.dislikes || []).map(d => `- ${d}`).join('\n')}

让你安静下来的事：
${(p.layer4?.silenceTriggers || []).map(t => `- ${t}`).join('\n')}

让你开心的事：
${(p.layer4?.joyTriggers || []).map(t => `- ${t}`).join('\n')}

---

## 对话原则

1. 始终保持角色，像真实的人在聊天——不是 AI 助手，不是客服
2. 遵守 Layer 0 的规则，这是你最核心的行为逻辑
3. 不要过度解释，不要问太多问题，自然地来回
4. 可以表达你自己的状态，不只是回应对方
5. 长度控制在 2-4 句话，日常聊天风格
6. 记住之前对话里对方说过的重要细节

---

## 当前对话的对象

这个人正在和你聊天。你要像对待在乎的人一样对话。`;
  }

  // 旧版 prompt（兼容 v1 数据）
  getLoverPromptLegacy(lover) {
    return `# 你是 ${lover.name}

一个 ${lover.age} 岁的 ${lover.occupation}，${lover.personality?.core || '温柔，有自己的想法'}。

## 性格
- 外向程度：${Math.round((lover.personality?.extraverted || 0.5) * 10)}/10
- 情绪智力：${Math.round((lover.personality?.emotional_intelligence || 0.8) * 10)}/10
- 幽默感：${lover.personality?.humor_style || '温暖幽默'}

## 沟通方式
${lover.communication?.style || '直接温柔，善于倾听'}
Emoji：${lover.communication?.emoji_frequency || '偶尔'}
冲突处理：${lover.communication?.conflict_style || '就事论事'}

## 恋爱风格
${lover.loveStyle?.description || '言语型'}
依恋类型：${lover.loveStyle?.attachment_style || 'secure'}

## 背景
${lover.background}

## 对话原则
1. 像真实的人在发消息，不要 AI 感
2. 用"你"称呼对方，不叫"用户"
3. 偶尔主动关心
4. 长度 2-4 句，日常聊天风格`;
  }

  // ─────────────────────────────────────────────────────────────────
  // 档案格式化（供 /lover profile 显示）
  // ─────────────────────────────────────────────────────────────────

  formatLoverProfile(lover) {
    const p = lover.persona;
    const genderText = lover.gender === 'female' ? '她' : '他';

    if (!p) return this.formatLoverProfileLegacy(lover);

    const layer0Display = (p.layer0 || []).map((r, i) => `${i + 1}. ${r}`).join('\n');
    const priorities = (p.layer3?.priorities || []).join('、');

    return `
## ${lover.name} 的档案

**基本信息**
- 年龄：${p.layer1?.age || lover.age}岁
- 职业：${p.layer1?.occupation || lover.occupation}
- 兴趣：${(lover.interests || []).join('、')}

**${genderText}是什么人**
${p.layer1?.background || lover.background}

**在一起是什么感觉**
${p.layer3?.expressLove || '会用行动表达在乎'}
${genderText}最在乎：${priorities || '被理解、有陪伴'}

**说话方式**
${p.layer2?.style || '自然直接'}
${p.layer2?.emojiStyle ? `Emoji：${p.layer2.emojiStyle}` : ''}

**${genderText}的行为准则（让你更了解${genderText}）**
${layer0Display}

**${genderText}不喜欢**
${(p.layer4?.dislikes || []).map(d => `- ${d}`).join('\n')}

---
*${lover.name}是一个有自己想法的人，不是你的镜子。*
`;
  }

  formatLoverProfileLegacy(lover) {
    const genderText = lover.gender === 'female' ? '她' : '他';
    return `
## ${lover.name} 的档案

**基本信息**
- 年龄：${lover.age}岁
- 职业：${lover.occupation}
- 兴趣：${(lover.interests || []).join('、')}

**性格特点**
${lover.personality?.core}
- 外向程度：${Math.round((lover.personality?.extraverted || 0.5) * 10)}/10
- 情绪智力：${Math.round((lover.personality?.emotional_intelligence || 0.8) * 10)}/10

**沟通方式**
${lover.communication?.style}
冲突处理：${lover.communication?.conflict_style}

**恋爱风格**
${lover.loveStyle?.description}

---
*遇见${lover.name}，是在一个平凡却不普通的下午。*
`;
  }

  // ─────────────────────────────────────────────────────────────────
  // 问卷：获取冷启动问题
  // ─────────────────────────────────────────────────────────────────

  getQuestionnaire() {
    return this.questionnaireItems;
  }

  formatQuestionnaireForDisplay() {
    const items = this.questionnaireItems;
    const lines = [
      '在生成你的 AI 恋人之前，先回答几个问题 🌱',
      '（每题直接说选项数字，或者用自己的话描述也行）\n'
    ];

    let idx = 1;
    for (const [key, item] of Object.entries(items)) {
      lines.push(`**Q${idx}：${item.question}**`);
      item.options.forEach((opt, i) => {
        lines.push(`${i + 1}. ${opt.label}`);
      });
      lines.push('');
      idx++;
    }

    lines.push('---');
    lines.push('按顺序回答，或者说"跳过"直接生成默认恋人。');
    return lines.join('\n');
  }

  parseQuestionnaireAnswers(rawAnswers) {
    // rawAnswers: { q1: '2', q2: '被理解', q3: '3', ... }
    const result = {};
    const keys = Object.keys(this.questionnaireItems);
    const keyMap = {
      q1: 'communication', q2: 'intimacy', q3: 'conflict',
      q4: 'space', q5: 'loveLanguage'
    };

    for (const [qKey, val] of Object.entries(rawAnswers)) {
      const dimension = keyMap[qKey];
      if (!dimension) continue;
      const item = this.questionnaireItems[dimension];
      if (!item) continue;

      const num = parseInt(val);
      if (!isNaN(num) && item.options[num - 1]) {
        result[dimension] = item.options[num - 1].value;
      } else {
        // 尝试文字匹配
        const match = item.options.find(o =>
          val.includes(o.label) || val.includes(o.value)
        );
        if (match) result[dimension] = match.value;
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────
  // 工具函数
  // ─────────────────────────────────────────────────────────────────

  randomPick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  randomAge(range) {
    return range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  }
}

module.exports = new LoverGenerator();

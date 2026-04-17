/**
 * profile-formatter.js — 画像的离线结构化渲染
 * 用于 /lover whoami 以及 /lover report 在无 apiFunction 时的降级输出。
 * 不调用 LLM，不引入依赖。
 */

function bar(score, width = 10) {
  const s = Math.max(0, Math.min(1, typeof score === 'number' ? score : 0));
  const filled = Math.round(s * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmtScore(score) {
  if (typeof score !== 'number') return '—';
  return score.toFixed(2);
}

function relativeTime(iso) {
  if (!iso) return '未知';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.round(hr / 24);
  return `${day} 天前`;
}

const ATTACHMENT_ZH = {
  secure: '安全型',
  anxious: '焦虑型',
  avoidant: '回避型',
  fearful: '恐惧型'
};

const LOVE_LANG_ZH = {
  words: '言语肯定',
  quality_time: '优质时间',
  gifts: '收到礼物',
  acts: '服务行为',
  touch: '身体接触'
};

const COMM_STYLE_ZH = {
  detailed_expressive: '细腻表达型',
  direct_efficient: '直接高效型',
  playful_emoji: '俏皮表情型',
  balanced: '平衡型'
};

const LIFESTYLE_ZH = {
  active: '活跃户外型',
  travel_oriented: '热爱旅行',
  indoor_hobby: '宅家/室内爱好为主'
};

const AESTHETIC_ZH = {
  mature_feminine: '偏成熟气质',
  cute: '偏可爱甜美'
};

const IDEAL_TYPE_ZH = {
  balanced: '平衡型',
  warm_supportive: '温暖支持型',
  independent_confident: '独立自信型'
};

function formatProfileStructured(profile) {
  if (!profile) {
    return '还没有画像。先运行 `/lover update` 基于现有数据生成画像，或 `/lover setup` 完成初始设置。';
  }

  const lines = [];
  const p = profile;

  lines.push('# 你的人格快照');
  lines.push('');
  const when = p.analyzedAt ? `${new Date(p.analyzedAt).toLocaleString('zh-CN', { hour12: false })}（${relativeTime(p.analyzedAt)}）` : '未知';
  lines.push(`分析时间：${when}`);
  const ds = p.dataSources || {};
  const sessions = ds.conversationSessions ?? p.sessionCount ?? 0;
  const browsing = ds.browsingRecords ?? (p.browsingSnapshot ? '有' : 0);
  lines.push(`数据来源：${sessions} 个对话会话 + ${browsing} 条浏览记录`);
  lines.push('');

  // 大五
  const bf = p.bigFive || {};
  const bfd = p.bigFiveDescription || {};
  if (Object.keys(bf).length > 0) {
    lines.push('## 大五人格');
    const rows = [
      ['开放性', bf.openness, bfd.openness],
      ['尽责性', bf.conscientiousness, bfd.conscientiousness],
      ['外向性', bf.extraversion, bfd.extraversion],
      ['宜人性', bf.agreeableness, bfd.agreeableness],
      ['神经质', bf.neuroticism, bfd.neuroticism]
    ];
    for (const [label, score, desc] of rows) {
      const line = `${label} ${bar(score)} ${fmtScore(score)}` + (desc ? ` · ${desc}` : '');
      lines.push(line);
    }
    lines.push('');
  }

  // 亲密关系
  lines.push('## 亲密关系');
  const attach = ATTACHMENT_ZH[p.attachmentStyle] || p.attachmentStyle || '—';
  lines.push(`依恋类型：${attach}${p.attachmentDescription ? ' —— ' + p.attachmentDescription : ''}`);
  const primaryLang = p.loveLanguages?.primary;
  if (primaryLang) lines.push(`爱情语言：${LOVE_LANG_ZH[primaryLang] || primaryLang}`);
  const comm = COMM_STYLE_ZH[p.communicationStyle] || p.communicationStyle;
  if (comm) lines.push(`沟通风格：${comm}`);
  lines.push('');

  // 兴趣与生活（来自浏览画像）
  const bs = p.browsingSnapshot;
  if (bs) {
    lines.push('## 兴趣与生活');
    if (bs.dominantDomain) {
      lines.push(`主导域名：${bs.dominantDomain}${bs.dominantDomainRatio != null ? ` (${bs.dominantDomainRatio}%)` : ''}`);
    }
    if (bs.browsingStyle) {
      const styleZh = { focused: '深度专注', moderate: '广泛涉猎', diverse: '多元探索' }[bs.browsingStyle] || bs.browsingStyle;
      lines.push(`浏览风格：${styleZh}`);
    }
    if (Array.isArray(bs.topInterests) && bs.topInterests.length > 0) {
      const topStr = bs.topInterests.slice(0, 6).map(i => `${i.tag}(${i.score})`).join(' · ');
      lines.push(`Top 兴趣：${topStr}`);
    }
    if (Array.isArray(bs.topCategories) && bs.topCategories.length > 0) {
      const catStr = bs.topCategories.slice(0, 5)
        .filter(c => c.percentage > 0)
        .map(c => `${c.category} ${c.percentage}%`)
        .join(' · ');
      if (catStr) lines.push(`Top 分类：${catStr}`);
    }
    lines.push('');
  }

  // 价值观
  if (Array.isArray(p.valuesPriority) && p.valuesPriority.length > 0) {
    lines.push('## 价值观优先');
    lines.push(p.valuesPriority.slice(0, 6).join(' → '));
    lines.push('');
  }

  // 隐藏偏好
  const hp = p.hiddenPreferences;
  if (hp) {
    const hpLines = [];
    if (hp.lifestyle_hint) hpLines.push(`生活方式：${LIFESTYLE_ZH[hp.lifestyle_hint] || hp.lifestyle_hint}`);
    if (hp.aesthetic_preference) hpLines.push(`审美偏好：${AESTHETIC_ZH[hp.aesthetic_preference] || hp.aesthetic_preference}`);
    if (hp.ideal_personality_type) hpLines.push(`理想型：${IDEAL_TYPE_ZH[hp.ideal_personality_type] || hp.ideal_personality_type}`);
    if (Array.isArray(hp.ideal_age_range) && hp.ideal_age_range.length === 2) {
      hpLines.push(`理想年龄：${hp.ideal_age_range[0]}-${hp.ideal_age_range[1]} 岁`);
    }
    if (hpLines.length > 0) {
      lines.push('## 隐藏偏好');
      hpLines.forEach(l => lines.push(l));
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('想要温暖版详细解读：`/lover report`');
  lines.push('重新分析最新数据：`/lover update`');

  return lines.join('\n');
}

// 对比前后两份画像，输出"本次更新了什么"
function formatProfileDiff(before, after) {
  if (!after) return '画像尚未生成。';
  if (!before) {
    return '🎉 这是你的第一份人格画像！\n使用 `/lover whoami` 查看完整快照。';
  }

  const lines = ['## 本次更新了什么', ''];

  // 数据量
  const b_sessions = before.dataSources?.conversationSessions ?? before.sessionCount ?? 0;
  const a_sessions = after.dataSources?.conversationSessions ?? after.sessionCount ?? 0;
  const b_browsing = before.dataSources?.browsingRecords ?? 0;
  const a_browsing = after.dataSources?.browsingRecords ?? 0;
  if (b_sessions !== a_sessions || b_browsing !== a_browsing) {
    lines.push(`数据量：对话 ${b_sessions} → ${a_sessions}，浏览 ${b_browsing} → ${a_browsing}`);
  }

  // Big Five 差异（|delta| >= 0.05）
  const bfB = before.bigFive || {};
  const bfA = after.bigFive || {};
  const bfDims = [
    ['openness', '开放性'],
    ['conscientiousness', '尽责性'],
    ['extraversion', '外向性'],
    ['agreeableness', '宜人性'],
    ['neuroticism', '神经质']
  ];
  const bfChanged = [];
  for (const [key, label] of bfDims) {
    const bv = bfB[key];
    const av = bfA[key];
    if (typeof bv === 'number' && typeof av === 'number') {
      if (Math.abs(av - bv) >= 0.05) {
        const arrow = av > bv ? '↑' : '↓';
        bfChanged.push(`${label} ${fmtScore(bv)} → ${fmtScore(av)} ${arrow}`);
      }
    }
  }
  if (bfChanged.length > 0) {
    lines.push('大五人格变化：');
    bfChanged.forEach(c => lines.push('  · ' + c));
  }

  // 依恋类型
  if (before.attachmentStyle !== after.attachmentStyle) {
    const bz = ATTACHMENT_ZH[before.attachmentStyle] || before.attachmentStyle || '—';
    const az = ATTACHMENT_ZH[after.attachmentStyle] || after.attachmentStyle || '—';
    lines.push(`依恋类型：${bz} → ${az}`);
  }

  // 主导域名
  const bDom = before.browsingSnapshot?.dominantDomain;
  const aDom = after.browsingSnapshot?.dominantDomain;
  if (bDom !== aDom) {
    lines.push(`主导域名：${bDom || '—'} → ${aDom || '—'}`);
  }

  // Top 兴趣变化
  const topOf = (p) => new Set((p?.browsingSnapshot?.topInterests || []).slice(0, 8).map(i => i.tag));
  const bTop = topOf(before);
  const aTop = topOf(after);
  const newIn = [...aTop].filter(t => !bTop.has(t));
  const dropped = [...bTop].filter(t => !aTop.has(t));
  if (newIn.length > 0) lines.push(`兴趣新上榜：${newIn.join(' · ')}`);
  if (dropped.length > 0) lines.push(`兴趣跌出榜：${dropped.join(' · ')}`);

  if (lines.length === 2) {
    lines.push('本次没有显著变化。画像仍基于最新数据刷新过。');
  }

  lines.push('');
  lines.push('完整画像：`/lover whoami`');
  lines.push('重新生成恋人以匹配：`/lover regenerate`');

  return lines.join('\n');
}

module.exports = {
  formatProfileStructured,
  formatProfileDiff,
  bar,
  relativeTime
};

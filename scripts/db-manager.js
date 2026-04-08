/**
 * db-manager.js — 数据库管理模块
 * 负责加密存储用户行为数据和恋人档案
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
const LOVERS_DIR = path.join(DATA_DIR, 'lovers');
const SESSIONS_DIR = path.join(DATA_DIR, 'sessions');
const KEY_FILE = path.join(DATA_DIR, '.key');

// 加密配置 — 密钥持久化到本地文件，避免重启后数据丢失
const ALGORITHM = 'aes-256-gcm';

function loadOrCreateKey() {
  if (process.env.LOVER_SKILL_KEY) {
    return process.env.LOVER_SKILL_KEY;
  }
  // 确保 data 目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(KEY_FILE)) {
    return fs.readFileSync(KEY_FILE, 'utf8').trim();
  }
  const newKey = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(KEY_FILE, newKey, { mode: 0o600 }); // 仅文件所有者可读
  return newKey;
}

const ENCRYPTION_KEY = loadOrCreateKey();

class DBManager {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories() {
    [DATA_DIR, PROFILES_DIR, LOVERS_DIR, SESSIONS_DIR].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // 加密数据
  encrypt(text) {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return {
      iv: iv.toString('hex'),
      authTag,
      data: encrypted
    };
  }

  // 解密数据
  decrypt(encryptedObj) {
    try {
      const key = Buffer.from(ENCRYPTION_KEY, 'hex');
      const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(encryptedObj.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));
      let decrypted = decipher.update(encryptedObj.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      return null;
    }
  }

  // 保存用户画像
  saveUserProfile(profile) {
    const filePath = path.join(PROFILES_DIR, 'user_profile.json.enc');
    const encrypted = this.encrypt(JSON.stringify(profile, null, 2));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return true;
  }

  // 读取用户画像
  loadUserProfile() {
    const filePath = path.join(PROFILES_DIR, 'user_profile.json.enc');
    if (!fs.existsSync(filePath)) return null;
    try {
      const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decrypted = this.decrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch (e) {
      return null;
    }
  }

  // 保存恋人档案
  saveLoverProfile(loverProfile) {
    const filePath = path.join(LOVERS_DIR, 'generated_lover.json.enc');
    const encrypted = this.encrypt(JSON.stringify(loverProfile, null, 2));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return true;
  }

  // 读取恋人档案
  loadLoverProfile() {
    const filePath = path.join(LOVERS_DIR, 'generated_lover.json.enc');
    if (!fs.existsSync(filePath)) return null;
    try {
      const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decrypted = this.decrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch (e) {
      return null;
    }
  }

  // 保存会话数据
  saveSession(sessionData) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `session_${timestamp}.json.enc`;
    const filePath = path.join(SESSIONS_DIR, fileName);
    const encrypted = this.encrypt(JSON.stringify(sessionData, null, 2));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return fileName;
  }

  // 读取所有会话（用于分析）
  loadAllSessions() {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json.enc'));
    const sessions = [];
    for (const file of files) {
      try {
        const encrypted = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8'));
        const decrypted = this.decrypt(encrypted);
        if (decrypted) {
          sessions.push(JSON.parse(decrypted));
        }
      } catch (e) {
        // 跳过损坏的文件
      }
    }
    return sessions;
  }

  // 保存分析报告
  saveReport(reportData) {
    const reportsDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `persona_report_${timestamp}.json`;
    const filePath = path.join(reportsDir, fileName);
    const encrypted = this.encrypt(JSON.stringify(reportData, null, 2));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return fileName;
  }

  // 导出所有数据
  exportAllData() {
    return {
      userProfile: this.loadUserProfile(),
      loverProfile: this.loadLoverProfile(),
      sessions: this.loadAllSessions(),
      exportDate: new Date().toISOString()
    };
  }

  // 保存对话历史（持久化跨会话）
  saveConversationHistory(history) {
    const filePath = path.join(LOVERS_DIR, 'conversation_history.json.enc');
    const encrypted = this.encrypt(JSON.stringify(history));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return true;
  }

  // 读取对话历史
  loadConversationHistory() {
    const filePath = path.join(LOVERS_DIR, 'conversation_history.json.enc');
    if (!fs.existsSync(filePath)) return [];
    try {
      const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decrypted = this.decrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : [];
    } catch (e) {
      return [];
    }
  }

  // 保存会话摘要（跨会话记忆）
  saveMemorySummary(summary) {
    const filePath = path.join(LOVERS_DIR, 'memory_summary.json.enc');
    if (summary === null) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return true;
    }
    const encrypted = this.encrypt(JSON.stringify(summary));
    fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2));
    return true;
  }

  // 读取会话摘要
  loadMemorySummary() {
    const filePath = path.join(LOVERS_DIR, 'memory_summary.json.enc');
    if (!fs.existsSync(filePath)) return null;
    try {
      const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const decrypted = this.decrypt(encrypted);
      return decrypted ? JSON.parse(decrypted) : null;
    } catch (e) {
      return null;
    }
  }

  // 删除所有数据
  resetAllData() {
    const deleteDir = (dir) => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    deleteDir(DATA_DIR);
    deleteDir(path.join(__dirname, '..', 'reports'));
    this.ensureDirectories();
    return true;
  }

  // 检查是否首次使用
  isFirstUse() {
    return !fs.existsSync(path.join(PROFILES_DIR, 'user_profile.json.enc'));
  }

  // 获取统计数据
  getStats() {
    const sessions = this.loadAllSessions();
    return {
      totalSessions: sessions.length,
      totalMessages: sessions.reduce((sum, s) => sum + (s.messages?.length || 0), 0),
      profileExists: fs.existsSync(path.join(PROFILES_DIR, 'user_profile.json.enc')),
      loverExists: fs.existsSync(path.join(LOVERS_DIR, 'generated_lover.json.enc'))
    };
  }
}

module.exports = new DBManager();

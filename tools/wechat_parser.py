#!/usr/bin/env python3
"""
微信聊天记录解析器
支持多种格式：txt, html, json, csv
"""

import argparse
import json
import re
import sys
from pathlib import Path
from collections import Counter

def parse_txt_wechat(content, target):
    """解析纯文本格式的微信聊天记录"""
    lines = content.split('\n')
    messages = []
    current_msg = None

    # 微信 txt 格式通常是：2023-01-01 12:00:00  张三: 消息内容
    # 或者：2023/1/1 12:00 张三: 消息
    time_pattern = r'(\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(:\d{2})?)\s+([^:]+):\s*(.+)'

    for line in lines:
        line = line.strip()
        if not line:
            continue

        match = re.match(time_pattern, line)
        if match:
            if current_msg:
                messages.append(current_msg)
            time_str, sender, msg = match.groups()
            sender = sender.strip()
            msg = msg.strip()
            if sender == target or target == "all":
                current_msg = {'time': time_str, 'sender': sender, 'content': msg, 'is_target': sender == target}
        elif current_msg and line:
            # 可能是消息换行，继续添加
            current_msg['content'] += '\n' + line

    if current_msg:
        messages.append(current_msg)

    return messages

def parse_html_wechat(content, target):
    """解析 HTML 格式的微信聊天记录"""
    messages = []

    # 提取每条消息
    msg_pattern = r'<div class="(\w+)">(.*?)</div>'
    time_pattern = r'<span class="time">(.*?)</span>'
    sender_pattern = r'<span class="nickname">(.*?)</span>'
    content_pattern = r'<span class="content">(.*?)</span>'

    blocks = re.split(r'<div class="message">', content)
    for block in blocks:
        if not block.strip():
            continue

        sender_match = re.search(sender_pattern, block)
        content_match = re.search(content_pattern, block, re.DOTALL)
        time_match = re.search(time_pattern, block)

        if sender_match and content_match:
            sender = sender_match.group(1).strip()
            msg_content = re.sub(r'<[^>]+>', '', content_match.group(1)).strip()
            time_str = time_match.group(1) if time_match else ""

            if sender == target or target == "all":
                messages.append({
                    'time': time_str,
                    'sender': sender,
                    'content': msg_content,
                    'is_target': sender == target
                })

    return messages

def parse_json_wechat(content, target):
    """解析 JSON 格式的微信聊天记录"""
    try:
        data = json.loads(content)
        messages = []

        # 尝试不同的 JSON 结构
        if isinstance(data, list):
            items = data
        elif isinstance(data, dict):
            if 'messages' in data:
                items = data['messages']
            else:
                items = [data]
        else:
            return []

        for item in items:
            if isinstance(item, dict):
                sender = item.get('sender', item.get('nickname', item.get('name', '')))
                content = item.get('content', item.get('text', ''))
                time_str = item.get('time', item.get('timestamp', ''))

                if sender == target or target == "all":
                    messages.append({
                        'time': str(time_str),
                        'sender': sender,
                        'content': str(content),
                        'is_target': sender == target
                    })

        return messages
    except json.JSONDecodeError:
        return []

def analyze_messages(messages, target):
    """分析消息内容，提取特征"""
    if not messages:
        return {}

    # 只分析目标人物的消息
    target_msgs = [m for m in messages if m.get('is_target')]

    if not target_msgs:
        return {'error': f'未找到与 "{target}" 的聊天记录'}

    # 提取内容文本
    all_text = '\n'.join([m['content'] for m in target_msgs])

    # 统计口头禅（重复的短句）
    words = re.findall(r'[\u4e00-\u9fa5]{2,4}', all_text)
    word_freq = Counter(words)
    catchphrases = [w for w, c in word_freq.most_common(20) if c >= 3]

    # 统计表情包使用
    emojis = re.findall(r'\[.*?\]', all_text)
    emoji_freq = Counter(emojis)
    top_emojis = [e for e, c in emoji_freq.most_common(10)]

    # 统计消息长度
    msg_lengths = [len(m['content']) for m in target_msgs]
    avg_length = sum(msg_lengths) / len(msg_lengths) if msg_lengths else 0

    # 统计标点符号使用
    exclamation_count = all_text.count('！') + all_text.count('!')
    question_count = all_text.count('？') + all_text.count('?')

    # 检测语气词
    tone_words = ['嗯', '好', '哈哈', '哈哈哈', '好吧', '其实', '感觉', '可能', '大概']
    tone_usage = {w: all_text.count(w) for w in tone_words if w in all_text}

    # 提取消息时间分布
    hours = []
    for m in target_msgs:
        time_str = m.get('time', '')
        hour_match = re.search(r'(\d{1,2}):\d{2}', time_str)
        if hour_match:
            hours.append(int(hour_match.group(1)))

    hour_distribution = Counter(hours)

    return {
        'total_messages': len(target_msgs),
        'avg_message_length': round(avg_length, 1),
        'exclamation_count': exclamation_count,
        'question_count': question_count,
        'emoji_usage': len(emojis),
        'top_emojis': top_emojis[:5],
        'catchphrases': catchphrases[:10],
        'tone_usage': tone_usage,
        'active_hours': dict(hour_distribution.most_common(5)),
        'communication_style': '简洁' if avg_length < 30 else ('中等' if avg_length < 80 else '详细'),
        'sample_messages': [m['content'][:100] for m in target_msgs[:5]]
    }

def main():
    parser = argparse.ArgumentParser(description='微信聊天记录解析器')
    parser.add_argument('--file', required=True, help='聊天记录文件路径')
    parser.add_argument('--target', default='all', help='目标人物名称')
    parser.add_argument('--output', default='/tmp/wechat_analysis.txt', help='输出文件路径')

    args = parser.parse_args()

    # 读取文件
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"错误：文件不存在 {args.file}", file=sys.stderr)
        sys.exit(1)

    content = file_path.read_text(encoding='utf-8')

    # 检测格式并解析
    if file_path.suffix == '.json':
        messages = parse_json_wechat(content, args.target)
    elif file_path.suffix == '.html':
        messages = parse_html_wechat(content, args.target)
    else:
        messages = parse_txt_wechat(content, args.target)

    # 分析
    analysis = analyze_messages(messages, args.target)

    # 生成报告
    report = f"""# 微信聊天记录分析报告

## 基本信息
- 分析目标：{args.target}
- 消息总数：{analysis.get('total_messages', 0)}
- 平均消息长度：{analysis.get('avg_message_length', 0)} 字符

## 沟通风格
- 沟通类型：{analysis.get('communication_style', '未知')}
- 感叹号使用：{analysis.get('exclamation_count', 0)} 次
- 问号使用：{analysis.get('question_count', 0)} 次
- 表情包使用：{analysis.get('emoji_usage', 0)} 次

## 口头禅 Top 10
{', '.join(analysis.get('catchphrases', ['无']))}

## 常用表情 Top 5
{', '.join(analysis.get('top_emojis', ['无']))}

## 语气词使用
{', '.join([f"{k}: {v}次" for k, v in analysis.get('tone_usage', {}).items()]) if analysis.get('tone_usage') else '无'}

## 活跃时段
{', '.join([f"{h}点" for h in analysis.get('active_hours', {}).keys()]) if analysis.get('active_hours') else '无数据'}

## 消息示例（最近5条）
"""
    for i, sample in enumerate(analysis.get('sample_messages', []), 1):
        report += f"{i}. {sample}...\n"

    # 写入输出
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding='utf-8')

    print(f"分析完成，结果已保存到 {args.output}")

if __name__ == '__main__':
    main()

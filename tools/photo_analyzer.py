#!/usr/bin/env python3
"""
照片分析器
从照片中提取 EXIF 信息、时间线、常去地点等
"""

import argparse
import os
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

def extract_exif_advanced(image_path):
    """提取照片的 EXIF 信息"""
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS, GPSTAGS
    except ImportError:
        print("错误：需要安装 Pillow 库。运行: pip install Pillow", file=sys.stderr)
        sys.exit(1)

    try:
        img = Image.open(image_path)
        exif_data = img._getexif()

        if not exif_data:
            return {'file': str(image_path), 'error': '无 EXIF 数据'}

        result = {
            'file': str(image_path),
            'filename': Path(image_path).name
        }

        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)

            if tag == 'DateTimeOriginal':
                result['datetime'] = value
            elif tag == 'Make':
                result['camera_make'] = value
            elif tag == 'Model':
                result['camera_model'] = value
            elif tag == 'GPSLatitude':
                result['gps_lat'] = value
            elif tag == 'GPSLongitude':
                result['gps_lon'] = value
            elif tag == 'ImageWidth':
                result['width'] = value
            elif tag == 'ImageHeight':
                result['height'] = value

        return result
    except Exception as e:
        return {'file': str(image_path), 'error': str(e)}

def analyze_photo_directory(directory, output_path):
    """分析目录中的所有照片"""
    photos = []
    directory = Path(directory)

    if not directory.exists():
        print(f"错误：目录不存在 {directory}", file=sys.stderr)
        sys.exit(1)

    # 支持的图片格式
    image_extensions = {'.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.bmp'}

    # 收集所有照片
    for ext in image_extensions:
        photos.extend(directory.glob(f'*{ext}'))
        photos.extend(directory.glob(f'*{ext.upper()}'))

    if not photos:
        return {'error': '未找到图片文件'}

    # 提取每张照片的信息
    photo_data = []
    for photo_path in photos:
        info = extract_exif_advanced(photo_path)
        photo_data.append(info)

    # 按时间排序
    timed_photos = []
    for p in photo_data:
        if 'datetime' in p and p['datetime']:
            try:
                dt = datetime.strptime(p['datetime'], '%Y:%m:%d %H:%M:%S')
                p['parsed_datetime'] = dt
                timed_photos.append(p)
            except:
                pass

    timed_photos.sort(key=lambda x: x.get('parsed_datetime', datetime.min))

    # 按月份统计
    monthly_count = defaultdict(int)
    hourly_count = defaultdict(int)
    locations = []

    for p in timed_photos:
        dt = p.get('parsed_datetime')
        if dt:
            month_key = dt.strftime('%Y-%m')
            monthly_count[month_key] += 1
            hourly_count[dt.hour] += 1

            if 'gps_lat' in p and 'gps_lon' in p:
                locations.append({
                    'lat': p['gps_lat'],
                    'lon': p['gps_lon'],
                    'datetime': p['datetime'],
                    'filename': p['filename']
                })

    # 生成报告
    report = f"""# 照片分析报告

## 基本统计
- 分析照片数：{len(photo_data)}
- 有 EXIF 数据的照片：{len(timed_photos)}

## 时间分布

### 月度活跃度
"""

    for month, count in sorted(monthly_count.items(), reverse=True)[:12]:
        bar = '█' * count
        report += f"- {month}: {bar} ({count}张)\n"

    report += f"""
### 拍照时段偏好
"""
    hour_names = {
        0: '深夜(0-4点)', 4: '凌晨(4-8点)', 8: '上午(8-12点)', 12: '中午(12-14点)',
        14: '下午(14-18点)', 18: '傍晚(18-20点)', 20: '晚上(20-24点)'
    }
    for hour in sorted(hourly_count.keys()):
        count = hourly_count[hour]
        if count > 0:
            time_range = hour_names.get(hour // 4 * 4, '其他')
            bar = '█' * count
            report += f"- {time_range}: {bar} ({count}张)\n"

    report += f"""
## EXIF 信息样本
"""
    for p in timed_photos[:5]:
        report += f"- {p.get('datetime', '未知')} | {p.get('camera_model', '未知设备')} | {p.get('filename', '未知')}\n"

    report += f"""
## 地理位置
"""
    if locations:
        report += f"检测到 {len(locations)} 张照片有 GPS 信息\n"
        report += "（可结合地图应用分析常去地点）\n"
    else:
        report += "未检测到 GPS 地理位置信息\n"

    report += f"""
## 分析说明
- 大部分照片元信息来自手机拍照
- 如需更详细的时间线分析，可将照片导入时光相册等应用
- GPS 信息需要手机拍照时开启位置权限
"""

    # 写入输出
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(report, encoding='utf-8')

    print(f"分析完成，结果已保存到 {output_path}")
    print(f"分析了 {len(photo_data)} 张照片，{len(timed_photos)} 张有 EXIF 数据")

    return {'photos': len(photo_data), 'with_exif': len(timed_photos)}

def main():
    parser = argparse.ArgumentParser(description='照片分析器')
    parser.add_argument('--dir', required=True, help='照片目录路径')
    parser.add_argument('--output', default='/tmp/photo_analysis.txt', help='输出文件路径')

    args = parser.parse_args()

    analyze_photo_directory(args.dir, args.output)

if __name__ == '__main__':
    main()

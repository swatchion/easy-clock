// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';

const ZH_MESSAGES = Object.freeze({
    'Easy Clock': '简易时钟',
    'Custom': '自定义',
    'Timezone + 24-hour (%Z %H:%M)': '时区缩写 + 24小时制 (%Z %H:%M)',
    '24-hour (%H:%M)': '24小时制 (%H:%M)',
    '24-hour with seconds (%H:%M:%S)': '24小时制含秒 (%H:%M:%S)',
    'Month-Day + Time (%m-%d %H:%M)': '月-日 + 时间 (%m-%d %H:%M)',
    'Weekday + Time (%a %H:%M)': '星期 + 时间 (%a %H:%M)',
    '12-hour (%I:%M %p)': '12小时制 (%I:%M %p)',
    'ISO Date & Time (%F %T %Z)': '完整 ISO 日期时间 (%F %T %Z)',
    'Left': '左侧区域',
    'Center': '居中区域',
    'Right': '右侧状态栏',
    'Hour (24-hour 00-23 / 12-hour 01-12)': '小时（24小时制 00-23 / 12小时制 01-12）',
    'Minute (00-59) / Second (00-59)': '分钟（00-59）/ 秒（00-59）',
    'AM / PM indicator': 'AM / PM 标记',
    'Timezone abbreviation (e.g. UTC) / numeric offset (e.g. +0000)': '时区缩写（如 UTC）/ 数字偏移（如 +0000）',
    'Year-Month-Day (e.g. 2026-11-16)': '年-月-日（如 2026-11-16）',
    'Abbreviated / full weekday name': '星期简称 / 全称',
    'Clock Settings': '时钟设置',
    'Live Preview': '实时预览',
    'System timezone': '当前系统时区',
    'Top Bar Output': '顶栏显示效果',
    'Timezone': '独立时区',
    'Select an IANA timezone or enter an identifier / UTC offset (e.g. UTC, Europe/London, Asia/Tokyo, +08:00)': '搜索选择 IANA 时区，或直接输入标识符 / UTC 偏移（如 UTC、Europe/London、Asia/Tokyo、+08:00）',
    'IANA Timezone': 'IANA 时区列表',
    'Open and type to filter timezones': '点击展开并输入关键字过滤时区',
    'Timezone Identifier / Offset': '时区标识符 / 偏移量',
    'Display Format (strftime)': '显示格式 (strftime)',
    'Customize output using GLib.DateTime.format() strftime specifiers': '使用 GLib.DateTime.format() 标准 strftime 格式字符串自定义显示',
    'Format Presets': '常用格式预设',
    'strftime Format String': 'strftime 格式字符串',
    'Custom Label Prefix (Optional)': '自定义前缀文本（可选）',
    'Common strftime Specifiers': '常用 strftime 占位符参考',
    'Expand to view format codes': '展开查看常用时间与日期格式代码',
    'Top Bar Position': '顶栏位置',
    'Choose where the independent clock appears in the top bar': '选择独立时钟在顶栏中的放置区域与顺序',
    'Panel Box': '顶栏区域',
    'Position Index': '区域内排序索引',
    '0 places the clock first; 1 in Center places it next to the system clock': '0 表示排在该区域最前；居中区域设为 1 通常排在系统时钟右侧',
    'Matches current system timezone': '当前选择与系统默认时区相同',
});

/**
 * Match the user's primary system language to supported UI languages ('zh' | 'en').
 * Falls back to 'en' whenever the primary system language cannot be matched.
 *
 * @param {string[]|null} languageNames Optional override list (defaults to GLib.get_language_names())
 * @returns {'zh'|'en'}
 */
export function resolveUiLanguage(languageNames = null) {
    const candidates = Array.isArray(languageNames)
        ? languageNames
        : GLib.get_language_names();

    for (const raw of candidates) {
        if (typeof raw !== 'string')
            continue;

        const normalized = raw.trim().split('.')[0].split('@')[0].toLowerCase();
        if (!normalized || normalized === 'c' || normalized === 'posix')
            continue;

        if (
            normalized === 'zh' ||
            normalized.startsWith('zh_') ||
            normalized.startsWith('zh-')
        ) {
            return 'zh';
        }

        if (
            normalized === 'en' ||
            normalized.startsWith('en_') ||
            normalized.startsWith('en-')
        ) {
            return 'en';
        }

        return 'en';
    }

    return 'en';
}

/**
 * Create a gettext-compatible translator function `_()` supporting Chinese and English,
 * defaulting to English when the system language cannot be matched.
 *
 * @param {((msgid: string) => string)|null} gettextFn Extension gettext bound function
 * @param {string[]|null} languageNames Optional language list override for testing
 * @returns {(msgid: string) => string}
 */
export function createTranslator(gettextFn = null, languageNames = null) {
    const uiLang = resolveUiLanguage(languageNames);

    return msgid => {
        if (uiLang === 'zh') {
            if (typeof gettextFn === 'function') {
                const translated = gettextFn(msgid);
                if (translated && translated !== msgid)
                    return translated;
            }
            return ZH_MESSAGES[msgid] ?? msgid;
        }

        return msgid;
    };
}

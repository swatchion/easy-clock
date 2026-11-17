// SPDX-License-Identifier: MIT

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {
    computeNextTickMs,
    FALLBACK_FORMAT,
    formatClockText,
    isValidFormat,
    needsSecondPrecision,
} from '../src/lib/clockFormatter.js';
import {
    createTranslator,
    resolveUiLanguage,
} from '../src/lib/i18n.js';
import {
    getFallbackTimezones,
    listAvailableTimezonesAsync,
} from '../src/lib/timezoneCatalog.js';
import {
    getSystemTimezoneId,
    isValidTimezone,
    resolveTimezone,
} from '../src/lib/timezones.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) {
        failed++;
        console.error(`FAIL: ${message}`);
        return;
    }
    passed++;
    console.log(`PASS: ${message}`);
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        failed++;
        console.error(`FAIL: ${message} (expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)})`);
        return;
    }
    passed++;
    console.log(`PASS: ${message}`);
}

function runAsync(promiseFactory) {
    const loop = GLib.MainLoop.new(null, false);
    let outcome;
    let caughtErr = null;

    promiseFactory()
        .then(res => {
            outcome = res;
            loop.quit();
        })
        .catch(err => {
            caughtErr = err;
            loop.quit();
        });

    loop.run();
    if (caughtErr !== null)
        throw caughtErr;

    return outcome;
}

const repoRoot = GLib.getenv('EASY_CLOCK_ROOT') ?? GLib.get_current_dir();

// 1. Metadata & EGO compliance validation
{
    const metaFile = Gio.File.new_for_path(`${repoRoot}/src/metadata.json`);
    const [ok, bytes] = metaFile.load_contents(null);
    assert(ok, 'metadata.json is readable');
    const meta = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    assertEqual(meta.uuid, 'easy-clock@swatchion.github.io', 'UUID conforms to EGO format');
    assertEqual(meta.url, 'https://github.com/swatchion/easy-clock', 'Declares public repository url');
    assert(!('version' in meta), 'Omits integer version field per EGO guidelines');
    assert(!/gnome/i.test(`${meta.name} ${meta.description}`), 'Does not mention GNOME in name/description per EGO rules');
    assert(Array.isArray(meta['shell-version']) && meta['shell-version'].includes('46'), 'Supports GNOME Shell 46');
    assertEqual(meta['settings-schema'], 'org.gnome.shell.extensions.easy-clock', 'Declares settings-schema');
}

// 2. Isolated GSettings schema verification
{
    assertEqual(GLib.getenv('GSETTINGS_BACKEND'), 'memory', 'Uses isolated memory GSettings backend');
    const schemaDir = `${repoRoot}/src/schemas`;
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
        schemaDir,
        Gio.SettingsSchemaSource.get_default(),
        false
    );
    const schema = schemaSource.lookup('org.gnome.shell.extensions.easy-clock', false);
    assert(schema !== null, 'Compiled GSettings schema loads cleanly');

    const settings = new Gio.Settings({settings_schema: schema});
    assertEqual(settings.get_string('timezone'), 'UTC', 'Default timezone is neutral UTC');
    assertEqual(settings.get_string('format'), '%Z %H:%M', 'Default format is %Z %H:%M');
    assertEqual(settings.get_string('label-prefix'), '', 'Default label-prefix is empty');
    assertEqual(settings.get_string('panel-position'), 'center', 'Default panel-position is center');
    assertEqual(settings.get_int('panel-index'), 1, 'Default panel-index is 1');
}

// 3. Async timezone discovery & validation
{
    const fallbackZones = getFallbackTimezones('Asia/Taipei');
    assertEqual(fallbackZones[0], 'UTC', 'Fallback list places UTC first');
    assert(fallbackZones.includes('Asia/Taipei'), 'Fallback list preserves active valid IANA timezone');

    const zones = runAsync(() => listAvailableTimezonesAsync());
    assert(zones.length > 100, `Asynchronously loaded ${zones.length} IANA timezones from system zoneinfo`);
    assertEqual(zones[0], 'UTC', 'UTC is listed first');

    const cancelled = new Gio.Cancellable();
    cancelled.cancel();
    const cancelledFallback = runAsync(() => listAvailableTimezonesAsync(cancelled));
    assert(cancelledFallback.length >= 10, 'Cancelled async load safely returns fallback zones without throwing');

    assert(isValidTimezone('UTC'), 'UTC is valid');
    assert(isValidTimezone('+08:00'), 'Fixed offset +08:00 is valid');
    assert(!isValidTimezone(''), 'Empty timezone is invalid');
    assert(!isValidTimezone('Invalid/NoSuchZone'), 'Unknown timezone identifier is rejected');
    assertEqual(resolveTimezone('Invalid/NoSuchZone').get_identifier(), 'UTC', 'Invalid timezone resolves safely to UTC');
    assert(getSystemTimezoneId().length > 0, 'Detects host system timezone identifier');
}

// 4. Deterministic timezone conversion & strftime formatting
{
    const fixedUtc = GLib.DateTime.new_utc(2026, 11, 16, 5, 35, 42);

    assertEqual(
        formatClockText({timezone: 'UTC', format: '%F %H:%M:%S'}, fixedUtc),
        '2026-11-16 05:35:42',
        'Formats UTC time accurately'
    );
    assertEqual(
        formatClockText({timezone: 'America/Chicago', format: '%F %H:%M'}, fixedUtc),
        '2026-11-15 23:35',
        'Converts UTC to America/Chicago accurately across date boundary'
    );
    assertEqual(
        formatClockText({timezone: 'Asia/Tokyo', format: '%H:%M:%S', labelPrefix: 'TYO '}, fixedUtc),
        'TYO 14:35:42',
        'Formats Asia/Tokyo with custom prefix'
    );
    assertEqual(
        formatClockText({timezone: 'UTC', format: ''}, fixedUtc),
        fixedUtc.format(FALLBACK_FORMAT),
        'Empty format falls back cleanly'
    );
    assert(isValidFormat('%H:%M:%S'), 'Recognizes valid strftime string');
    assert(!isValidFormat(''), 'Rejects empty strftime string');
}

// 5. Tick precision & boundary alignment
{
    assert(!needsSecondPrecision('%H:%M'), '%H:%M uses minute-aligned ticks');
    assert(!needsSecondPrecision('%Z %H:%M %%S'), 'Escaped %%S does not trigger second ticks');
    assert(needsSecondPrecision('%H:%M:%S'), '%H:%M:%S enables second-aligned ticks');
    assert(needsSecondPrecision('%T'), '%T enables second-aligned ticks');

    const sampleMidMinuteUs = (60 * 1000 + 12300) * 1000;
    assertEqual(computeNextTickMs(sampleMidMinuteUs, false), 47725, 'Minute tick sleeps until exact next minute boundary');

    const sampleSecUs = 1400 * 1000;
    assertEqual(computeNextTickMs(sampleSecUs, true), 610, 'Second tick sleeps until exact next second boundary');
}

// 6. EGO static import isolation, async I/O & timer teardown checks
{
    const decoder = new TextDecoder('utf-8');
    const readSrc = relPath => {
        const [, bytes] = Gio.File.new_for_path(`${repoRoot}/${relPath}`).load_contents(null);
        return decoder.decode(bytes);
    };

    const extSrc = readSrc('src/extension.js');
    const fmtSrc = readSrc('src/lib/clockFormatter.js');
    const i18nSrc = readSrc('src/lib/i18n.js');
    const tzSrc = readSrc('src/lib/timezones.js');
    const catalogSrc = readSrc('src/lib/timezoneCatalog.js');
    const prefsSrc = readSrc('src/prefs.js');

    assert(!/gi:\/\/(Gtk|Gdk|Adw)/.test(extSrc), 'extension.js does not import GTK/Adw');
    assert(!/gi:\/\/(Gtk|Gdk|Adw)/.test(i18nSrc), 'i18n.js does not import GTK/Adw');
    assert(!/gi:\/\/(St|Clutter|Meta|Shell)/.test(prefsSrc), 'prefs.js does not import Shell/Clutter/St/Meta');
    assert(!/gi:\/\/(St|Clutter|Meta|Shell)/.test(i18nSrc), 'i18n.js does not import Shell/Clutter/St/Meta');
    assert(!/gi:\/\/(St|Clutter|Meta|Shell)/.test(catalogSrc), 'timezoneCatalog.js does not import Shell/Clutter/St/Meta');

    for (const [name, src] of [
        ['extension.js', extSrc],
        ['lib/clockFormatter.js', fmtSrc],
        ['lib/i18n.js', i18nSrc],
        ['lib/timezones.js', tzSrc],
    ]) {
        assert(!/gi:\/\/Gio/.test(src), `Shell-reachable ${name} does not import Gio`);
    }

    for (const [name, src] of [
        ['extension.js', extSrc],
        ['prefs.js', prefsSrc],
        ['lib/clockFormatter.js', fmtSrc],
        ['lib/i18n.js', i18nSrc],
        ['lib/timezones.js', tzSrc],
        ['lib/timezoneCatalog.js', catalogSrc],
    ]) {
        assert(
            !/\b(load_contents|file_get_contents|query_exists)\s*\(/.test(src),
            `${name} avoids synchronous file I/O (EGO-X-004)`
        );
    }

    assert(
        /disable\s*\(\)\s*\{[\s\S]*?this\._clearTimer\(\)/.test(extSrc) &&
        /_clearTimer\s*\(\)\s*\{[\s\S]*?GLib\.Source\.remove\(this\._timeoutId\)/.test(extSrc),
        'extension.js removes _timeoutId in disable() helper _clearTimer() (EGO-L-004)'
    );

    // 7. Bilingual (Chinese & English) localization & language matching checks
    assertEqual(resolveUiLanguage(['zh_CN.UTF-8', 'zh_CN', 'zh', 'C']), 'zh', 'Matches zh_CN to Chinese UI');
    assertEqual(resolveUiLanguage(['zh_TW.UTF-8', 'zh_TW', 'zh', 'C']), 'zh', 'Matches zh_TW to Chinese UI');
    assertEqual(resolveUiLanguage(['zh_SG.UTF-8', 'zh', 'C']), 'zh', 'Matches zh_SG to Chinese UI');
    assertEqual(resolveUiLanguage(['en_US.UTF-8', 'en_US', 'en', 'zh_CN', 'C']), 'en', 'Matches en_US primary language to English UI');
    assertEqual(resolveUiLanguage(['ja_JP.UTF-8', 'ja_JP', 'ja', 'zh_CN', 'C']), 'en', 'Unmatched ja_JP defaults to English UI');
    assertEqual(resolveUiLanguage(['fr_FR.UTF-8', 'fr', 'C']), 'en', 'Unmatched fr_FR defaults to English UI');
    assertEqual(resolveUiLanguage(['C.UTF-8', 'C']), 'en', 'C.UTF-8 defaults to English UI');
    assertEqual(resolveUiLanguage([]), 'en', 'Empty language list defaults to English UI');

    const zhTranslator = createTranslator(null, ['zh_CN']);
    const enTranslator = createTranslator(null, ['en_US']);
    const fallbackTranslator = createTranslator(null, ['de_DE']);

    const msgIds = new Set();
    for (const src of [extSrc, prefsSrc]) {
        for (const match of src.matchAll(/\b_\(\s*'((?:\\'|[^'])+)'\s*\)/g))
            msgIds.add(match[1].replace(/\\'/g, "'"));
    }
    assert(msgIds.size >= 35, `Extracted ${msgIds.size} translatable UI strings from sources`);

    const missingBuiltinZh = [...msgIds].filter(id => zhTranslator(id) === id);
    assertEqual(missingBuiltinZh.length, 0, `Built-in Chinese translator covers all ${msgIds.size} UI strings`);
    assertEqual(enTranslator('Clock Settings'), 'Clock Settings', 'English translator returns English UI text');
    assertEqual(fallbackTranslator('Clock Settings'), 'Clock Settings', 'Unmatched locale translator defaults to English UI text');

    const parsePo = poText => {
        const map = new Map();
        const pairRegex = /msgid\s+"((?:\\"|[^"])*)"\s*\nmsgstr\s+"((?:\\"|[^"])*)"/g;
        for (const m of poText.matchAll(pairRegex)) {
            if (m[1].length > 0)
                map.set(m[1], m[2]);
        }
        return map;
    };

    for (const poFile of ['po/en.po', 'po/zh_CN.po', 'po/zh.po']) {
        const poMap = parsePo(readSrc(poFile));
        const missing = [...msgIds].filter(id => !poMap.get(id));
        assertEqual(
            missing.length,
            0,
            `${poFile} provides non-empty translations for all ${msgIds.size} UI strings`
        );
    }

    const extDir = GLib.getenv('EASY_CLOCK_EXT_DIR');
    if (extDir) {
        for (const lang of ['en', 'zh', 'zh_CN']) {
            const moFile = Gio.File.new_for_path(`${extDir}/locale/${lang}/LC_MESSAGES/easy-clock.mo`);
            assert(moFile.query_exists(null), `Packaged extension includes compiled ${lang} locale catalog`);
        }
    }
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0)
    imports.system.exit(1);

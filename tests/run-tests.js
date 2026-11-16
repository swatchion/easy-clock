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
    getSystemTimezoneId,
    isValidTimezone,
    listAvailableTimezones,
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

// 3. Timezone discovery & validation
{
    const zones = listAvailableTimezones();
    assert(zones.length > 100, `Loaded ${zones.length} IANA timezones from system zoneinfo`);
    assertEqual(zones[0], 'UTC', 'UTC is listed first');
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

// 6. EGO static import isolation check
{
    const decoder = new TextDecoder('utf-8');
    const [, extBytes] = Gio.File.new_for_path(`${repoRoot}/src/extension.js`).load_contents(null);
    const extSrc = decoder.decode(extBytes);
    assert(!/gi:\/\/(Gtk|Gdk|Adw)/.test(extSrc), 'extension.js does not import GTK/Adw');

    const [, prefsBytes] = Gio.File.new_for_path(`${repoRoot}/src/prefs.js`).load_contents(null);
    const prefsSrc = decoder.decode(prefsBytes);
    assert(!/gi:\/\/(St|Clutter|Meta|Shell)/.test(prefsSrc), 'prefs.js does not import Shell/Clutter/St/Meta');
}

console.log(`\nSummary: ${passed} passed, ${failed} failed.`);
if (failed > 0)
    imports.system.exit(1);

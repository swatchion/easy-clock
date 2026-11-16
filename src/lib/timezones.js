// SPDX-License-Identifier: MIT

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ZONE_TAB_PATHS = [
    '/usr/share/zoneinfo/zone1970.tab',
    '/usr/share/zoneinfo/zone.tab',
];

const DEFAULT_FALLBACK_ZONES = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
];

export function isValidTimezone(identifier) {
    if (typeof identifier !== 'string' || identifier.trim() === '')
        return false;

    return GLib.TimeZone.new_identifier(identifier.trim()) !== null;
}

export function resolveTimezone(identifier) {
    const trimmed = typeof identifier === 'string' ? identifier.trim() : '';
    if (trimmed.length > 0) {
        const tz = GLib.TimeZone.new_identifier(trimmed);
        if (tz !== null)
            return tz;
    }

    return GLib.TimeZone.new_utc();
}

export function getSystemTimezoneId() {
    const localTz = GLib.TimeZone.new_local();
    return localTz.get_identifier() ?? 'Local';
}

export function listAvailableTimezones() {
    const zones = new Set(['UTC']);
    const decoder = new TextDecoder('utf-8');

    for (const tablePath of ZONE_TAB_PATHS) {
        const file = Gio.File.new_for_path(tablePath);
        if (!file.query_exists(null))
            continue;

        try {
            const [ok, contents] = file.load_contents(null);
            if (!ok)
                continue;

            const text = decoder.decode(contents);
            for (const rawLine of text.split('\n')) {
                const line = rawLine.trim();
                if (!line || line.startsWith('#'))
                    continue;

                const columns = line.split('\t');
                if (columns.length >= 3 && columns[2]) {
                    const tzName = columns[2].trim();
                    if (isValidTimezone(tzName))
                        zones.add(tzName);
                }
            }
            break;
        } catch (err) {
            console.warn(`[easy-clock] Failed reading ${tablePath}: ${err.message}`);
        }
    }

    if (zones.size <= 1) {
        for (const fallback of DEFAULT_FALLBACK_ZONES)
            zones.add(fallback);
    }

    zones.delete('UTC');
    const sorted = Array.from(zones).sort((a, b) => a.localeCompare(b));
    return ['UTC', ...sorted];
}

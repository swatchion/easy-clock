// SPDX-License-Identifier: MIT

import Gio from 'gi://Gio';

import {isValidTimezone} from './timezones.js';

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

function sortWithUtcFirst(zoneSet) {
    zoneSet.delete('UTC');
    const sorted = Array.from(zoneSet).sort((a, b) => a.localeCompare(b));
    return ['UTC', ...sorted];
}

function loadFileContentsAsync(file, cancellable = null) {
    return new Promise((resolve, reject) => {
        file.load_contents_async(cancellable, (source, result) => {
            try {
                const [ok, contents] = source.load_contents_finish(result);
                resolve(ok ? contents : null);
            } catch (err) {
                reject(err);
            }
        });
    });
}

export function getFallbackTimezones(currentTz = '') {
    const zones = new Set(DEFAULT_FALLBACK_ZONES);
    const trimmed = typeof currentTz === 'string' ? currentTz.trim() : '';
    if (trimmed.includes('/') && isValidTimezone(trimmed))
        zones.add(trimmed);

    return sortWithUtcFirst(zones);
}

export async function listAvailableTimezonesAsync(cancellable = null) {
    const zones = new Set(['UTC']);
    const decoder = new TextDecoder('utf-8');

    for (const tablePath of ZONE_TAB_PATHS) {
        if (cancellable?.is_cancelled())
            break;

        const file = Gio.File.new_for_path(tablePath);
        try {
            const contents = await loadFileContentsAsync(file, cancellable);
            if (!contents)
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
            if (
                err?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ||
                cancellable?.is_cancelled()
            ) {
                break;
            }
            if (err?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                continue;

            console.warn(`[easy-clock] Failed reading ${tablePath}: ${err.message}`);
        }
    }

    if (zones.size <= 1) {
        for (const fallback of DEFAULT_FALLBACK_ZONES)
            zones.add(fallback);
    }

    return sortWithUtcFirst(zones);
}

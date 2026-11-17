// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';

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

// SPDX-License-Identifier: MIT

import GLib from 'gi://GLib';

import {resolveTimezone} from './timezones.js';

export const FALLBACK_FORMAT = '%Z %H:%M';

export function isValidFormat(format) {
    if (typeof format !== 'string' || format.length === 0)
        return false;

    const sample = GLib.DateTime.new_now_utc();
    return sample.format(format) !== null;
}

export function needsSecondPrecision(format) {
    if (typeof format !== 'string' || format.length === 0)
        return false;

    const unescaped = format.replace(/%%/g, '');
    return /%[-_0^#]?[EO]?[SsTrXc+]/.test(unescaped);
}

/**
 * Compute milliseconds until the next wall-clock second or minute rollover.
 *
 * @param {number} nowUs Current epoch time in microseconds (GLib.get_real_time())
 * @param {boolean} secondPrecision Whether format displays seconds
 * @returns {number} Delay in milliseconds (>= 50)
 */
export function computeNextTickMs(nowUs, secondPrecision) {
    const nowMs = Math.floor(nowUs / 1000);

    if (secondPrecision) {
        const remainderMs = ((nowMs % 1000) + 1000) % 1000;
        return Math.max(50, 1000 - remainderMs + 10);
    }

    const remainderMinuteMs = ((nowMs % 60000) + 60000) % 60000;
    return Math.max(50, 60000 - remainderMinuteMs + 25);
}

export function formatClockText({timezone, format, labelPrefix = ''}, nowUtc = null) {
    const baseUtc = nowUtc ?? GLib.DateTime.new_now_utc();
    const tz = resolveTimezone(timezone);
    const zoned = baseUtc.to_timezone(tz) ?? baseUtc;

    const effectiveFormat = typeof format === 'string' && format.length > 0
        ? format
        : FALLBACK_FORMAT;

    const rendered = zoned.format(effectiveFormat) ?? zoned.format(FALLBACK_FORMAT) ?? '';
    return `${labelPrefix ?? ''}${rendered}`;
}

// SPDX-License-Identifier: MIT

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {formatClockText, isValidFormat} from './lib/clockFormatter.js';
import {
    getSystemTimezoneId,
    isValidTimezone,
    listAvailableTimezones,
} from './lib/timezones.js';

export default class EasyClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const _ = this.gettext.bind(this);
        const settings = this.getSettings();
        window.set_default_size(620, 680);

        const formatPresets = [
            {label: _('Custom'), value: ''},
            {label: _('Timezone + 24-hour (%Z %H:%M)'), value: '%Z %H:%M'},
            {label: _('24-hour (%H:%M)'), value: '%H:%M'},
            {label: _('24-hour with seconds (%H:%M:%S)'), value: '%H:%M:%S'},
            {label: _('Month-Day + Time (%m-%d %H:%M)'), value: '%m-%d %H:%M'},
            {label: _('Weekday + Time (%a %H:%M)'), value: '%a %H:%M'},
            {label: _('12-hour (%I:%M %p)'), value: '%I:%M %p'},
            {label: _('ISO Date & Time (%F %T %Z)'), value: '%F %T %Z'},
        ];

        const panelPositions = [
            {label: _('Left'), value: 'left'},
            {label: _('Center'), value: 'center'},
            {label: _('Right'), value: 'right'},
        ];

        const strftimeHints = [
            ['%H / %I', _('Hour (24-hour 00-23 / 12-hour 01-12)')],
            ['%M / %S', _('Minute (00-59) / Second (00-59)')],
            ['%p', _('AM / PM indicator')],
            ['%Z / %z', _('Timezone abbreviation (e.g. UTC) / numeric offset (e.g. +0000)')],
            ['%Y-%m-%d / %F', _('Year-Month-Day (e.g. 2026-11-16)')],
            ['%a / %A', _('Abbreviated / full weekday name')],
        ];

        const page = new Adw.PreferencesPage({
            title: _('Clock Settings'),
            icon_name: 'preferences-system-time-symbolic',
        });
        window.add(page);

        const systemTzId = getSystemTimezoneId();

        // --- 1. Live Preview Group ---
        const previewGroup = new Adw.PreferencesGroup({
            title: _('Live Preview'),
            description: `${_('System timezone')}: ${systemTzId}`,
        });
        page.add(previewGroup);

        const previewRow = new Adw.ActionRow({
            title: _('Top Bar Output'),
        });
        const previewValueLabel = new Gtk.Label({
            valign: Gtk.Align.CENTER,
            css_classes: ['title-3', 'numeric'],
            selectable: true,
        });
        previewRow.add_suffix(previewValueLabel);
        previewGroup.add(previewRow);

        // --- 2. Timezone Configuration Group ---
        const tzGroup = new Adw.PreferencesGroup({
            title: _('Timezone'),
            description: _('Select an IANA timezone or enter an identifier / UTC offset (e.g. UTC, Europe/London, Asia/Tokyo, +08:00)'),
        });
        page.add(tzGroup);

        const availableZones = listAvailableTimezones();
        const zoneModel = Gtk.StringList.new(availableZones);
        const tzComboRow = new Adw.ComboRow({
            title: _('IANA Timezone'),
            subtitle: _('Open and type to filter timezones'),
            model: zoneModel,
            enable_search: true,
            expression: Gtk.PropertyExpression.new(Gtk.StringObject, null, 'string'),
        });
        tzGroup.add(tzComboRow);

        const tzEntryRow = new Adw.EntryRow({
            title: _('Timezone Identifier / Offset'),
            text: settings.get_string('timezone'),
            show_apply_button: false,
        });
        tzGroup.add(tzEntryRow);

        let syncingTimezone = false;

        const syncComboFromTz = tzValue => {
            const idx = availableZones.indexOf(tzValue);
            if (idx >= 0 && tzComboRow.selected !== idx)
                tzComboRow.selected = idx;
        };

        syncComboFromTz(settings.get_string('timezone'));

        tzComboRow.connect('notify::selected', () => {
            if (syncingTimezone)
                return;

            const idx = tzComboRow.selected;
            if (idx === Gtk.INVALID_LIST_POSITION || idx >= availableZones.length)
                return;

            const chosen = availableZones[idx];
            syncingTimezone = true;
            tzEntryRow.text = chosen;
            settings.set_string('timezone', chosen);
            syncingTimezone = false;
        });

        tzEntryRow.connect('changed', () => {
            const candidate = tzEntryRow.text.trim();
            const valid = isValidTimezone(candidate);

            if (valid) {
                tzEntryRow.remove_css_class('error');
                if (!syncingTimezone) {
                    syncingTimezone = true;
                    settings.set_string('timezone', candidate);
                    syncComboFromTz(candidate);
                    syncingTimezone = false;
                }
            } else {
                tzEntryRow.add_css_class('error');
            }
        });

        // --- 3. Format & Prefix Group ---
        const formatGroup = new Adw.PreferencesGroup({
            title: _('Display Format (strftime)'),
            description: _('Customize output using GLib.DateTime.format() strftime specifiers'),
        });
        page.add(formatGroup);

        const presetModel = Gtk.StringList.new(formatPresets.map(p => p.label));
        const presetRow = new Adw.ComboRow({
            title: _('Format Presets'),
            model: presetModel,
        });
        formatGroup.add(presetRow);

        const formatEntryRow = new Adw.EntryRow({
            title: _('strftime Format String'),
            text: settings.get_string('format'),
        });
        formatGroup.add(formatEntryRow);

        const prefixEntryRow = new Adw.EntryRow({
            title: _('Custom Label Prefix (Optional)'),
            text: settings.get_string('label-prefix'),
        });
        settings.bind(
            'label-prefix',
            prefixEntryRow,
            'text',
            Gio.SettingsBindFlags.DEFAULT
        );
        formatGroup.add(prefixEntryRow);

        const hintsExpander = new Adw.ExpanderRow({
            title: _('Common strftime Specifiers'),
            subtitle: _('Expand to view format codes'),
        });
        for (const [token, desc] of strftimeHints) {
            hintsExpander.add_row(new Adw.ActionRow({
                title: token,
                subtitle: desc,
            }));
        }
        formatGroup.add(hintsExpander);

        let syncingFormat = false;

        const syncPresetSelection = fmt => {
            const matchIndex = formatPresets.findIndex((p, i) => i > 0 && p.value === fmt);
            presetRow.selected = matchIndex >= 0 ? matchIndex : 0;
        };
        syncPresetSelection(settings.get_string('format'));

        presetRow.connect('notify::selected', () => {
            if (syncingFormat)
                return;

            const chosen = formatPresets[presetRow.selected];
            if (chosen && chosen.value) {
                syncingFormat = true;
                formatEntryRow.text = chosen.value;
                settings.set_string('format', chosen.value);
                formatEntryRow.remove_css_class('error');
                syncingFormat = false;
            }
        });

        formatEntryRow.connect('changed', () => {
            const fmt = formatEntryRow.text;
            const valid = isValidFormat(fmt);

            if (valid) {
                formatEntryRow.remove_css_class('error');
                if (!syncingFormat) {
                    syncingFormat = true;
                    settings.set_string('format', fmt);
                    syncPresetSelection(fmt);
                    syncingFormat = false;
                }
            } else {
                formatEntryRow.add_css_class('error');
            }
        });

        // --- 4. Top Bar Position Group ---
        const positionGroup = new Adw.PreferencesGroup({
            title: _('Top Bar Position'),
            description: _('Choose where the independent clock appears in the top bar'),
        });
        page.add(positionGroup);

        const posModel = Gtk.StringList.new(panelPositions.map(p => p.label));
        const posComboRow = new Adw.ComboRow({
            title: _('Panel Box'),
            model: posModel,
        });
        const initialPosIdx = panelPositions.findIndex(
            p => p.value === settings.get_string('panel-position')
        );
        posComboRow.selected = initialPosIdx >= 0 ? initialPosIdx : 1;
        posComboRow.connect('notify::selected', () => {
            const item = panelPositions[posComboRow.selected];
            if (item)
                settings.set_string('panel-position', item.value);
        });
        positionGroup.add(posComboRow);

        const indexSpinRow = new Adw.SpinRow({
            title: _('Position Index'),
            subtitle: _('0 places the clock first; 1 in Center places it next to the system clock'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 20,
                step_increment: 1,
                page_increment: 1,
                value: settings.get_int('panel-index'),
            }),
        });
        settings.bind(
            'panel-index',
            indexSpinRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
        positionGroup.add(indexSpinRow);

        // --- Live Preview Updater & Clean Teardown ---
        const updatePreview = () => {
            const tz = settings.get_string('timezone');
            const fmt = settings.get_string('format');
            const prefix = settings.get_string('label-prefix');

            previewValueLabel.label = formatClockText({
                timezone: tz,
                format: fmt,
                labelPrefix: prefix,
            });

            if (tz === systemTzId) {
                previewRow.subtitle = _('Matches current system timezone');
            } else {
                previewRow.subtitle = `${tz}  |  ${fmt}`;
            }
        };

        const settingsSignalIds = [
            settings.connect('changed::timezone', updatePreview),
            settings.connect('changed::format', updatePreview),
            settings.connect('changed::label-prefix', updatePreview),
        ];
        updatePreview();

        let previewTimerId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            1,
            () => {
                updatePreview();
                return GLib.SOURCE_CONTINUE;
            }
        );
        GLib.Source.set_name_by_id(previewTimerId, '[easy-clock] prefs-preview');

        const cleanupResources = () => {
            if (previewTimerId !== 0) {
                GLib.Source.remove(previewTimerId);
                previewTimerId = 0;
            }
            while (settingsSignalIds.length > 0) {
                const sigId = settingsSignalIds.pop();
                settings.disconnect(sigId);
            }
        };

        window.connect('close-request', () => {
            cleanupResources();
            return false;
        });
        page.connect('destroy', cleanupResources);
    }
}

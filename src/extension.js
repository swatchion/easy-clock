// SPDX-License-Identifier: MIT

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {
    computeNextTickMs,
    formatClockText,
    needsSecondPrecision,
} from './lib/clockFormatter.js';
import {createTranslator} from './lib/i18n.js';

const VALID_BOXES = new Set(['left', 'center', 'right']);

class EasyClockIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    constructor(extension) {
        const _ = createTranslator(extension.gettext.bind(extension));
        const indicatorName = _('Easy Clock');
        super(0.5, indicatorName, true);

        this._extension = extension;
        this.accessible_name = indicatorName;

        this._label = new St.Label({
            style_class: 'easy-clock-label',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);

        this.connectObject(
            'event',
            (_actor, event) => this._onEvent(event),
            this
        );
    }

    setText(text) {
        if (this._label)
            this._label.text = text;
    }

    _onEvent(event) {
        const eventType = event.type();

        if (eventType === Clutter.EventType.BUTTON_PRESS) {
            if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                this._openPrefsSafe();
                return Clutter.EVENT_STOP;
            }
        } else if (eventType === Clutter.EventType.TOUCH_BEGIN) {
            this._openPrefsSafe();
            return Clutter.EVENT_STOP;
        } else if (eventType === Clutter.EventType.KEY_PRESS) {
            const symbol = event.get_key_symbol();
            if (
                symbol === Clutter.KEY_Return ||
                symbol === Clutter.KEY_KP_Enter ||
                symbol === Clutter.KEY_space
            ) {
                this._openPrefsSafe();
                return Clutter.EVENT_STOP;
            }
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _openPrefsSafe() {
        try {
            this._extension?.openPreferences();
        } catch (err) {
            console.error(`[easy-clock] Failed to open preferences: ${err.message}`);
        }
    }

    destroy() {
        this.disconnectObject(this);
        this._extension = null;
        this._label = null;

        super.destroy();
    }
}

export default class EasyClockExtension extends Extension {
    enable() {
        this._timeoutId = null;
        this._settings = this.getSettings();
        this._settings.connectObject(
            'changed::timezone', () => this._refresh(),
            'changed::format', () => this._refresh(),
            'changed::label-prefix', () => this._refresh(),
            'changed::panel-position', () => this._rebuildIndicator(),
            'changed::panel-index', () => this._rebuildIndicator(),
            this
        );

        this._createIndicator();
        this._refresh();
    }

    disable() {
        this._clearTimer();
        this._destroyIndicator();

        if (this._settings) {
            this._settings.disconnectObject(this);
            this._settings = null;
        }
    }

    _clearTimer() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    _createIndicator() {
        if (!this._settings)
            return;

        const rawBox = this._settings.get_string('panel-position');
        const box = VALID_BOXES.has(rawBox) ? rawBox : 'center';
        const index = this._settings.get_int('panel-index');

        this._indicator = new EasyClockIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, index, box);
    }

    _destroyIndicator() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _rebuildIndicator() {
        this._destroyIndicator();
        this._createIndicator();
        this._refresh();
    }

    _refresh() {
        if (!this._settings || !this._indicator)
            return;

        const timezone = this._settings.get_string('timezone');
        const format = this._settings.get_string('format');
        const labelPrefix = this._settings.get_string('label-prefix');

        this._indicator.setText(formatClockText({
            timezone,
            format,
            labelPrefix,
        }));

        this._scheduleNextTick(format);
    }

    _scheduleNextTick(format) {
        this._clearTimer();

        const secondPrecision = needsSecondPrecision(format);
        const delayMs = computeNextTickMs(GLib.get_real_time(), secondPrecision);

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._timeoutId = null;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._timeoutId, '[easy-clock] tick');
    }
}

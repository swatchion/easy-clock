// SPDX-License-Identifier: MIT

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const smokeCheckOnly = GLib.getenv('EASY_CLOCK_PREFS_SMOKE') === '1';
const repoRoot = GLib.getenv('EASY_CLOCK_ROOT') ?? GLib.get_current_dir();
const srcPath = `${repoRoot}/src`;

const gresourcePath = '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
const resource = Gio.Resource.load(gresourcePath);
Gio.resources_register(resource);

Adw.init();

const [, metaBytes] = Gio.File.new_for_path(`${srcPath}/metadata.json`).load_contents(null);
const metadata = JSON.parse(new TextDecoder('utf-8').decode(metaBytes));
metadata.dir = Gio.File.new_for_path(srcPath);
metadata.path = srcPath;

const prefsModuleUrl = Gio.File.new_for_path(`${srcPath}/prefs.js`).get_uri();
const {default: EasyClockPreferences} = await import(prefsModuleUrl);
const prefsInstance = new EasyClockPreferences(metadata);

const app = new Adw.Application({
    application_id: 'io.github.swatchion.EasyClock.PrefsSandbox',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

app.connect('activate', () => {
    const win = new Adw.PreferencesWindow({
        application: app,
        title: 'Easy Clock Preferences (Sandbox)',
    });

    prefsInstance.fillPreferencesWindow(win);

    if (smokeCheckOnly) {
        win.present();
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            console.log('PASS: Real src/prefs.js EasyClockPreferences executed cleanly in sandbox');
            win.close();
            win.destroy();
            app.quit();
            return GLib.SOURCE_REMOVE;
        });
        return;
    }

    win.present();
});

app.run([]);

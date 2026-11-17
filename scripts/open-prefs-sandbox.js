// SPDX-License-Identifier: MIT

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const smokeCheckOnly = GLib.getenv('EASY_CLOCK_PREFS_SMOKE') === '1';
const expectedTitle = GLib.getenv('EASY_CLOCK_EXPECT_TITLE');
const expectedPageTitle = GLib.getenv('EASY_CLOCK_EXPECT_PAGE_TITLE');
const repoRoot = GLib.getenv('EASY_CLOCK_ROOT') ?? GLib.get_current_dir();
const extPath = GLib.getenv('EASY_CLOCK_EXT_DIR') ?? `${repoRoot}/src`;

const gresourcePath = '/usr/share/gnome-shell/org.gnome.Shell.Extensions.src.gresource';
const resource = Gio.Resource.load(gresourcePath);
Gio.resources_register(resource);

Adw.init();

const [, metaBytes] = Gio.File.new_for_path(`${extPath}/metadata.json`).load_contents(null);
const metadata = JSON.parse(new TextDecoder('utf-8').decode(metaBytes));
metadata.dir = Gio.File.new_for_path(extPath);
metadata.path = extPath;

const prefsModuleUrl = Gio.File.new_for_path(`${extPath}/prefs.js`).get_uri();
const {default: EasyClockPreferences} = await import(prefsModuleUrl);
const prefsInstance = new EasyClockPreferences(metadata);

let exitCode = 0;

const app = new Adw.Application({
    application_id: 'io.github.swatchion.EasyClock.PrefsSandbox',
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});

app.connect('activate', () => {
    const win = new Adw.PreferencesWindow({
        application: app,
        title: metadata.name,
    });

    prefsInstance.fillPreferencesWindow(win);

    if (expectedTitle && win.get_title() !== expectedTitle) {
        console.error(`FAIL: Expected window title "${expectedTitle}", got "${win.get_title()}"`);
        exitCode = 1;
    }
    if (expectedPageTitle && win.visible_page?.get_title() !== expectedPageTitle) {
        console.error(`FAIL: Expected page title "${expectedPageTitle}", got "${win.visible_page?.get_title()}"`);
        exitCode = 1;
    }

    if (smokeCheckOnly) {
        win.present();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            if (exitCode === 0) {
                console.log(
                    `PASS: Real prefs.js executed cleanly (title="${win.get_title()}", page="${win.visible_page?.get_title()}")`
                );
            }
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
if (exitCode !== 0)
    imports.system.exit(exitCode);

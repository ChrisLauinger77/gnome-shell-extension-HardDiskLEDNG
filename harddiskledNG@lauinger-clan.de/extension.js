import { default as Clutter } from "gi://Clutter";
import { default as St } from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { default as Gio } from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

export default class HardDiskLEDExtension extends Extension {
    refreshTime = 2.0; // in seconds, speed displayed also /s

    ledThreshold = 500000;
    ledMinThreshold = 100000;

    settings = null;
    settingsChangedId = null;
    colorChangedId = null;
    button = null;
    timeout = null;
    cur = null;
    ioSpeed = null;
    lastCount = null;
    lastSpeed = null;
    mode = null;
    layoutManager = null;
    ioSpeedStaticIcon = null;
    ioSpeedIcon = null;

    init() {
        this.cur = 0;
        this.lastCount = 0;
    }

    changeMode() {
        let mode = this.mode + 1;
        if (mode > 7) {
            mode = 0;
        }
        // the 'changed::mode' handler updates this.mode and refreshes the view
        this.settings.set_int("mode", mode);
    }

    onModeChanged() {
        this.mode = this.settings.get_int("mode");
        if (this.mode > 7) {
            this.mode = 0;
        }
        this.parseStat(true);
    }

    applyLedColor() {
        const color = this.settings.get_string("led-color");
        // only allow plain CSS color values (#rrggbb, rgb(...), names) in the inline style
        if (/^[#a-zA-Z0-9(),.\s%]+$/.test(color)) {
            this.ioSpeedIcon.set_style(`color: ${color};`);
        } else {
            this.ioSpeedIcon.set_style(null);
        }
    }

    updateVisibility() {
        if ([2, 3, 6, 7].includes(this.mode)) {
            this.ioSpeed.hide();
        } else {
            this.ioSpeed.show();
        }
        if ([4, 5, 6, 7].includes(this.mode)) {
            this.ioSpeedStaticIcon.hide();
        } else {
            this.ioSpeedStaticIcon.show();
        }
        if (this.mode === 5) {
            this.ioSpeedIcon.hide();
        } else {
            this.ioSpeedIcon.show();
        }
    }

    parseStat(forceDot = false) {
        try {
            const inputFile = Gio.file_new_for_path("/proc/diskstats");
            const [, contents] = inputFile.load_contents(null);
            const lines = new TextDecoder().decode(contents).split("\n");

            let count = 0;
            for (const line of lines) {
                const fields = line.split(/ +/);
                if (fields.length <= 2) break;

                if (
                    parseInt(fields[2]) % 16 === 0 &&
                    fields[3].indexOf("md0") !== 0 &&
                    fields[3].indexOf("ram0") !== 0 &&
                    fields[3].indexOf("dm-0") !== 0 &&
                    fields[3].indexOf("zram0") !== 0 &&
                    fields[3].indexOf("loop0") !== 0
                ) {
                    count = count + parseInt(fields[6]) + parseInt(fields[10]);
                    // log(fields[3] + ':' + fields[6] + ' ' + fields[10] + ' ' + count);
                }
            }

            if (this.lastCount === 0) this.lastCount = count;

            const speed = ((count - this.lastCount) / this.refreshTime) * 512;

            let dot = " ";
            if (speed > this.lastSpeed || forceDot || speed > this.ledThreshold) {
                if (speed > this.ledMinThreshold) {
                    if ([0, 2, 4, 6].includes(this.mode)) {
                        dot = "●";
                    } else if ([1, 3, 7].includes(this.mode)) {
                        dot = "⬤";
                    }
                }
            }
            this.updateVisibility();

            this.ioSpeedIcon.set_text(dot);
            this.ioSpeed.set_text(this.speedToString(speed));

            this.lastCount = count;
            this.lastSpeed = speed;
        } catch (e) {
            this.ioSpeed.set_text(e.message);
        }

        return true;
    }

    speedToString(amount) {
        let digits;
        const speedMap = ["B/s", "K/s", "M/s", "G/s"];

        if (amount === 0) return "0" + speedMap[0];

        let unit = 0;
        while (amount >= 1000) {
            // 1M=1024K, 1MB/s=1000MB/s
            amount /= 1000;
            ++unit;
        }

        if (amount >= 100)
            // 100MB 100KB 200KB
            digits = 0;
        else if (amount >= 10)
            // 10MB 10.2
            digits = 1;
        else digits = 2;
        return String(amount.toFixed(digits)) + speedMap[unit];
    }

    enable() {
        this.init();
        this.settings = this.getSettings();

        // apply the configured default mode on load, -1 (None) keeps the last used mode
        const defaultMode = this.settings.get_int("defaultmode");
        if (defaultMode >= 0 && defaultMode <= 7) {
            this.settings.set_int("mode", defaultMode);
        }
        this.mode = this.settings.get_int("mode");
        if (this.mode > 7) {
            this.mode = 0;
        }

        this.button = new St.Button({
            style_class: "panel-button",
            reactive: true,
            can_focus: true,
            x_expand: true,
            y_expand: false,
            track_hover: true,
        });

        this.layoutManager = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: "harddiskled-container",
        });

        this.ioSpeedStaticIcon = new St.Icon({
            style_class: "system-status-icon",
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.icon_new_for_string("drive-harddisk-symbolic"),
        });

        this.ioSpeed = new St.Label({
            text: "---",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskled-label",
        });

        this.ioSpeedIcon = new St.Label({
            text: "",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskled-icon",
        });

        this.layoutManager.add_child(this.ioSpeedStaticIcon);
        this.layoutManager.add_child(this.ioSpeedIcon);
        this.layoutManager.add_child(this.ioSpeed);
        this.button.connect("button-press-event", this.changeMode.bind(this));

        this.button.set_child(this.layoutManager);

        Main.panel._rightBox.insert_child_at_index(this.button, 0);

        // react to mode changes from the preferences dialog (and from clicking)
        this.settingsChangedId = this.settings.connect("changed::mode", this.onModeChanged.bind(this));

        this.applyLedColor();
        this.colorChangedId = this.settings.connect("changed::led-color", this.applyLedColor.bind(this));

        // the monotonic time, in microseconds
        this.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, this.refreshTime * 1000, () => this.parseStat(true));
    }

    disable() {
        if (this.timeout) {
            GLib.source_remove(this.timeout);
            this.timeout = null;
        }
        if (this.settingsChangedId) {
            this.settings.disconnect(this.settingsChangedId);
            this.settingsChangedId = null;
        }
        if (this.colorChangedId) {
            this.settings.disconnect(this.colorChangedId);
            this.colorChangedId = null;
        }
        Main.panel._rightBox.remove_child(this.button);
        this.button.destroy();
        this.settings = null;
        this.button = null;
        this.layoutManager = null;
        this.ioSpeedStaticIcon = null;
        this.ioSpeed = null;
        this.ioSpeedIcon = null;
    }
}

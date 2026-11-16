import { default as Clutter } from "gi://Clutter";
import { default as St } from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { default as Gio } from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { DiskStatsSampler, parseDiskStats } from "./lib/diskStats.js";

export default class HardDiskLEDNGExtension extends Extension {
    refreshTime = 2.0; // in seconds

    ledThreshold = 500000;
    ledMinThreshold = 100000;

    settings = null;
    settingsChangedId = null;
    colorChangedId = null;
    button = null;
    timeout = null;
    ioSpeed = null;
    lastSpeed = null;
    sampler = null;
    mode = null;
    layoutManager = null;
    ioSpeedStaticIcon = null;
    ioSpeedIcon = null;

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
        this.updateDisplay(this.lastSpeed, true);
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

    readDiskStats() {
        const devices = new Set();
        const enumerator = Gio.File.new_for_path("/sys/block").enumerate_children(
            "standard::name,standard::symlink-target",
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        try {
            for (let info = enumerator.next_file(null); info !== null; info = enumerator.next_file(null)) {
                if (!info.get_symlink_target().includes("/virtual/")) devices.add(info.get_name());
            }
        } finally {
            enumerator.close(null);
        }

        const [, contents] = Gio.File.new_for_path("/proc/diskstats").load_contents(null);
        return parseDiskStats(new TextDecoder().decode(contents), devices);
    }

    parseStat(forceDot = false) {
        try {
            const counters = this.readDiskStats();
            const speed = this.sampler.sample(counters, GLib.get_monotonic_time() / 1000000);
            this.updateDisplay(speed, forceDot);
            this.lastSpeed = speed;
        } catch (e) {
            this.ioSpeed.set_text(e.message);
        }
        return true;
    }

    updateDisplay(speed, forceDot = false) {
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
        this.sampler = new DiskStatsSampler();
        this.lastSpeed = 0;
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
            style_class: "harddiskledng-container",
        });

        this.ioSpeedStaticIcon = new St.Icon({
            style_class: "system-status-icon",
            y_align: Clutter.ActorAlign.CENTER,
            gicon: Gio.icon_new_for_string("drive-harddisk-symbolic"),
        });

        this.ioSpeed = new St.Label({
            text: "---",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskledng-label",
        });

        this.ioSpeedIcon = new St.Label({
            text: "",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskledng-icon",
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

        this.parseStat(true);
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
        this.sampler = null;
        this.lastSpeed = null;
        this.mode = null;
    }
}

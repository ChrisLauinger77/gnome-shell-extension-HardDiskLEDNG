import { default as Clutter } from "gi://Clutter";
import { default as St } from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import { default as Gio } from "gi://Gio";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import { DiskStatsSampler } from "./lib/diskStats.js";
import { readDiskStats } from "./lib/diskStatsReader.js";

// display modes, indexed by the "mode" setting; ui/prefs.ui lists them in the same order
const MODES = [
    { speed: true, diskIcon: true, led: true, largeLed: false }, // small LED, speed and icon
    { speed: true, diskIcon: true, led: true, largeLed: true }, // large LED, speed and icon
    { speed: false, diskIcon: true, led: true, largeLed: false }, // small LED and icon
    { speed: false, diskIcon: true, led: true, largeLed: true }, // large LED and icon
    { speed: true, diskIcon: false, led: true, largeLed: false }, // small LED and speed
    { speed: true, diskIcon: false, led: false, largeLed: false }, // speed only
    { speed: false, diskIcon: false, led: true, largeLed: false }, // small LED only
    { speed: false, diskIcon: false, led: true, largeLed: true }, // large LED only
];

export default class HardDiskLEDNGExtension extends Extension {
    refreshTime = 2; // in seconds

    ledMinThreshold = 100000;

    settings = null;
    settingsChangedId = null;
    colorChangedId = null;
    button = null;
    timeout = null;
    ioSpeed = null;
    lastSpeed = null;
    sampler = null;
    readCancellable = null;
    mode = null;
    layoutManager = null;
    ioSpeedStaticIcon = null;
    ioSpeedIcon = null;

    changeMode(step) {
        // step forward (1) or backward (-1) through the modes, wrapping at both ends
        const mode = (this.mode + step + MODES.length) % MODES.length;
        // the 'changed::mode' handler updates this.mode and refreshes the view
        this.settings.set_int("mode", mode);
    }

    addClickGestures() {
        // left click cycles forward, right click backward, middle click opens the preferences
        const actions = [
            [Clutter.BUTTON_PRIMARY, () => this.changeMode(1)],
            [Clutter.BUTTON_MIDDLE, () => this.openPreferences()],
            [Clutter.BUTTON_SECONDARY, () => this.changeMode(-1)],
        ];
        for (const [button, action] of actions) {
            const gesture = new Clutter.ClickGesture({
                required_button: button,
                recognize_on_press: true,
            });
            gesture.connect("recognize", action);
            this.button.add_action(gesture);
        }
    }

    onModeChanged() {
        this.mode = this.settings.get_int("mode");
        this.updateDisplay(this.lastSpeed);
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
        const { speed, diskIcon, led } = MODES[this.mode];
        this.ioSpeed.visible = speed;
        this.ioSpeedStaticIcon.visible = diskIcon;
        this.ioSpeedIcon.visible = led;
    }

    async parseStat() {
        if (this.readCancellable) return;

        const cancellable = new Gio.Cancellable();
        const sampler = this.sampler;
        this.readCancellable = cancellable;
        try {
            const counters = await readDiskStats(cancellable);
            if (cancellable.is_cancelled()) return;

            const speed = sampler.sample(counters, GLib.get_monotonic_time() / 1000000);
            this.updateDisplay(speed);
            this.lastSpeed = speed;
        } catch (error) {
            if (cancellable.is_cancelled()) return;

            // the timer retries every refresh, so only log the first failure of a series
            if (this.lastSpeed !== null) console.error(`${this.metadata.name}: failed to read disk statistics`, error);
            this.lastSpeed = null;
            this.updateDisplay(null);
        } finally {
            if (this.readCancellable === cancellable) this.readCancellable = null;
        }
    }

    updateDisplay(speed) {
        // a null speed means the last disk read failed
        this.updateVisibility();
        this.ioSpeedIcon.icon_size = MODES[this.mode].largeLed ? 12 : 8;
        this.ioSpeedIcon.opacity = speed !== null && speed > this.ledMinThreshold ? 255 : 0;
        this.ioSpeed.set_text(speed === null ? "--" : this.speedToString(speed));
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

        // apply the configured default mode on load, -1 (None) keeps the last used mode;
        // the schema ranges keep both keys within the valid modes
        const defaultMode = this.settings.get_int("defaultmode");
        if (defaultMode >= 0) {
            this.settings.set_int("mode", defaultMode);
        }
        this.mode = this.settings.get_int("mode");

        // menu-less panel button, clicks are handled by addClickGestures()
        this.button = new PanelMenu.Button(0.0, this.metadata.name, true);

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
            text: "0B/s",
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskledng-label",
        });

        this.ioSpeedIcon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${this.path}/icons/activity-led-symbolic.svg`),
            icon_size: 8,
            opacity: 0,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: "harddiskledng-icon",
        });

        this.layoutManager.add_child(this.ioSpeedStaticIcon);
        this.layoutManager.add_child(this.ioSpeedIcon);
        this.layoutManager.add_child(this.ioSpeed);
        this.button.add_child(this.layoutManager);
        this.addClickGestures();

        Main.panel.addToStatusArea(this.uuid, this.button, 0, "right");

        // react to mode changes from the preferences dialog (and from clicking)
        this.settingsChangedId = this.settings.connect("changed::mode", this.onModeChanged.bind(this));

        this.applyLedColor();
        this.colorChangedId = this.settings.connect("changed::led-color", this.applyLedColor.bind(this));

        this.updateDisplay(0);
        this.parseStat();
        // seconds-based timers let GLib batch wakeups; speeds use the measured elapsed time
        this.timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this.refreshTime, () => {
            this.parseStat();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this.timeout) {
            GLib.source_remove(this.timeout);
            this.timeout = null;
        }
        if (this.readCancellable) {
            this.readCancellable.cancel();
            this.readCancellable = null;
        }
        if (this.settingsChangedId) {
            this.settings.disconnect(this.settingsChangedId);
            this.settingsChangedId = null;
        }
        if (this.colorChangedId) {
            this.settings.disconnect(this.colorChangedId);
            this.colorChangedId = null;
        }
        // destroying the button also removes it from the panel's status area
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

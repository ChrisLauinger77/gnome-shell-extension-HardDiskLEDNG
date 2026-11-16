import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { DiskStatsSampler } from "../harddiskledNG@lauinger-clan.de/lib/diskStats.js";

const source = readFileSync(new URL("../harddiskledNG@lauinger-clan.de/extension.js", import.meta.url), "utf8");

class Actor {
    visible = true;
    destroyed = false;
    children = [];
    actions = [];

    constructor(properties) {
        Object.assign(this, properties);
    }

    show() {
        this.visible = true;
    }
    hide() {
        this.visible = false;
    }
    set_style(style) {
        this.style = style;
    }
    add_child(child) {
        this.children.push(child);
    }
    add_action(action) {
        this.actions.push(action);
    }
    connect() {
        return 1;
    }
    destroy() {
        this.destroyed = true;
        for (const child of this.children) child.destroy();
    }
}

class PanelButton extends Actor {
    constructor(menuAlignment, nameText, dontCreateMenu) {
        super({ menuAlignment, nameText, dontCreateMenu });
    }
}

class ClickGesture {
    constructor(properties) {
        Object.assign(this, properties);
    }
    connect(signal, callback) {
        this[signal] = callback;
        return 1;
    }
}

class Icon extends Actor {}
class Label extends Actor {
    set_text(text) {
        assert.equal(this.destroyed, false, "A destroyed label was updated");
        this.text = text;
    }
}

class Cancellable {
    cancelled = false;
    cancel() {
        this.cancelled = true;
    }
    is_cancelled() {
        return this.cancelled;
    }
}

function counters(read) {
    return new Map([["8:0:sda", { read, written: 0 }]]);
}

function createIndicator(t) {
    let time = 0;
    let mode = 0;
    let timer = null;
    let signalId = 0;
    let preferencesOpened = 0;
    const handlers = new Map();
    const requests = [];
    const statusArea = [];
    const errors = [];
    const settings = {
        get_int: (key) => (key === "defaultmode" ? -1 : mode),
        get_string: () => "#00ff00",
        set_int(_key, value) {
            mode = value;
            for (const { signal, callback } of handlers.values()) {
                if (signal === "changed::mode") callback();
            }
        },
        connect(signal, callback) {
            handlers.set(++signalId, { signal, callback });
            return signalId;
        },
        disconnect(id) {
            handlers.delete(id);
        },
    };
    const Extension = runInNewContext(
        source.replace(/^import .*;\n/gm, "").replace("export default class", "class") + "\nHardDiskLEDNGExtension;",
        {
            Extension: class {
                path = "/test/extension";
                uuid = "harddiskledNG@lauinger-clan.de";
                metadata = { name: "Harddisk LED NG" };
                getSettings() {
                    return settings;
                }
                getLogger() {
                    return { error: (...args) => errors.push(args) };
                }
                openPreferences() {
                    preferencesOpened++;
                }
            },
            DiskStatsSampler,
            readDiskStats: (cancellable) =>
                new Promise((resolve, reject) => {
                    requests.push({ cancellable, resolve, reject });
                }),
            Gio: { Cancellable, icon_new_for_string: (path) => path },
            St: { BoxLayout: Actor, Label, Icon },
            Clutter: {
                ActorAlign: { CENTER: 0 },
                Orientation: { HORIZONTAL: 0 },
                BUTTON_PRIMARY: 1,
                BUTTON_MIDDLE: 2,
                BUTTON_SECONDARY: 3,
                ClickGesture,
            },
            PanelMenu: { Button: PanelButton },
            Main: {
                panel: {
                    addToStatusArea(role, indicator, position, box) {
                        statusArea.push({ role, indicator, position, box });
                    },
                },
            },
            GLib: {
                PRIORITY_DEFAULT: 0,
                SOURCE_CONTINUE: true,
                get_monotonic_time: () => time * 1000000,
                timeout_add_seconds(_priority, interval, callback) {
                    assert.equal(interval, 2);
                    timer = callback;
                    return 1;
                },
                source_remove() {
                    timer = null;
                },
            },
        }
    );
    const indicator = new Extension();
    indicator.enable();
    t.after(() => {
        if (indicator.button) indicator.disable();
    });
    return {
        indicator,
        requests,
        settings,
        statusArea,
        errors,
        preferencesOpened: () => preferencesOpened,
        click(button) {
            const gesture = indicator.button.actions.find((action) => action.required_button === button);
            assert.equal(gesture.recognize_on_press, true);
            gesture.recognize(gesture);
        },
        tick() {
            assert.notEqual(timer, null);
            return timer();
        },
        async finish(index, read, nextTime) {
            time = nextTime;
            requests[index].resolve(counters(read));
            await setImmediate();
        },
        async fail(index) {
            requests[index].reject(new Error("disk read failed"));
            await setImmediate();
        },
    };
}

test("every display mode uses a symbolic LED icon with the correct size and visibility", async (t) => {
    const fixture = createIndicator(t);
    const { indicator, settings } = fixture;
    assert.ok(indicator.ioSpeedIcon instanceof Icon);
    assert.equal(indicator.ioSpeedIcon.gicon, "/test/extension/icons/activity-led-symbolic.svg");
    assert.equal(indicator.ioSpeedIcon.style, "color: #00ff00;");
    await fixture.finish(0, 1000, 0);
    const modes = [
        [0, true, true, true, 8],
        [1, true, true, true, 12],
        [2, false, true, true, 8],
        [3, false, true, true, 12],
        [4, true, false, true, 8],
        [5, true, false, false, 8],
        [6, false, false, true, 8],
        [7, false, false, true, 12],
    ];
    let sample = 0;
    for (const [mode, speedVisible, iconVisible, ledVisible, size] of [...modes, ...modes.slice().reverse()]) {
        sample++;
        settings.set_int("mode", mode);
        assert.equal(fixture.tick(), true);
        // eslint-disable-next-line no-await-in-loop -- Verify transitions on the same sampler and actors.
        await fixture.finish(sample, 1000 + sample * 2000, sample * 2);
        assert.equal(indicator.ioSpeed.text, "512K/s", `mode ${mode}: refresh failed`);
        assert.equal(indicator.ioSpeed.visible, speedVisible, `mode ${mode}: speed visibility`);
        assert.equal(indicator.ioSpeedStaticIcon.visible, iconVisible, `mode ${mode}: disk icon visibility`);
        assert.equal(indicator.ioSpeedIcon.visible, ledVisible, `mode ${mode}: LED visibility`);
        assert.equal(indicator.ioSpeedIcon.icon_size, size, `mode ${mode}: LED size`);
        assert.equal(indicator.ioSpeedIcon.opacity, 255, `mode ${mode}: active LED`);
    }
});

test("idle samples make the LED transparent while preserving its space", async (t) => {
    const fixture = createIndicator(t);
    await fixture.finish(0, 1000, 0);
    fixture.tick();
    await fixture.finish(1, 3000, 2);
    assert.equal(fixture.indicator.ioSpeedIcon.opacity, 255);
    fixture.tick();
    await fixture.finish(2, 3000, 4);
    assert.equal(fixture.indicator.ioSpeed.text, "0B/s");
    assert.equal(fixture.indicator.ioSpeedIcon.opacity, 0);
    assert.equal(fixture.indicator.ioSpeedIcon.visible, true);
});

test("changing display mode reuses the current speed without advancing the disk sample", async (t) => {
    const fixture = createIndicator(t);
    await fixture.finish(0, 1000, 0);
    fixture.tick();
    await fixture.finish(1, 3000, 2);
    const sampler = fixture.indicator.sampler;
    const previousCounters = sampler.previousCounters;
    fixture.settings.set_int("mode", 7);
    assert.equal(fixture.indicator.mode, 7);
    assert.equal(fixture.indicator.ioSpeed.text, "512K/s");
    assert.equal(fixture.indicator.ioSpeedIcon.icon_size, 12);
    assert.equal(fixture.requests.length, 2);
    assert.equal(sampler.previousTime, 2);
    assert.equal(sampler.previousCounters, previousCounters);
});

test("the indicator is a named, menu-less status area button", (t) => {
    const { indicator, statusArea } = createIndicator(t);
    assert.ok(indicator.button instanceof PanelButton);
    assert.equal(indicator.button.nameText, "Harddisk LED NG");
    assert.equal(indicator.button.dontCreateMenu, true);
    assert.deepEqual(statusArea, [
        { role: "harddiskledNG@lauinger-clan.de", indicator: indicator.button, position: 0, box: "right" },
    ]);
    const button = indicator.button;
    indicator.disable();
    assert.equal(button.destroyed, true);
});

test("left clicks cycle forward, right clicks backward, and a middle click opens the preferences", (t) => {
    const fixture = createIndicator(t);
    const { indicator, settings } = fixture;
    assert.equal(indicator.button.actions.length, 3);
    fixture.click(1);
    fixture.click(1);
    assert.equal(indicator.mode, 2);
    fixture.click(3);
    assert.equal(indicator.mode, 1);
    fixture.click(2);
    assert.equal(indicator.mode, 1);
    assert.equal(fixture.preferencesOpened(), 1);
    settings.set_int("mode", 7);
    fixture.click(1);
    assert.equal(indicator.mode, 0);
    fixture.click(3);
    assert.equal(indicator.mode, 7);
    assert.equal(fixture.requests.length, 1);
});

test("timer ticks do not start overlapping disk reads", async (t) => {
    const fixture = createIndicator(t);
    assert.equal(fixture.tick(), true);
    assert.equal(fixture.requests.length, 1);
    await fixture.indicator.parseStat();
    assert.equal(fixture.requests.length, 1);
    await fixture.finish(0, 1000, 0);
    fixture.tick();
    assert.equal(fixture.requests.length, 2);
});

test("disable cancels a pending read and ignores its late completion", async (t) => {
    const fixture = createIndicator(t);
    const led = fixture.indicator.ioSpeedIcon;
    const speed = fixture.indicator.ioSpeed;
    fixture.indicator.disable();
    assert.equal(fixture.requests[0].cancellable.is_cancelled(), true);
    assert.equal(led.destroyed, true);
    assert.equal(speed.destroyed, true);
    await fixture.finish(0, 1000, 2);
    assert.equal(fixture.indicator.sampler, null);
    assert.equal(fixture.indicator.ioSpeed, null);
    assert.equal(fixture.indicator.readCancellable, null);
});

test("a cancelled read cannot update a newly enabled instance or clear its pending read", async (t) => {
    const fixture = createIndicator(t);
    fixture.indicator.disable();
    fixture.indicator.enable();
    const activeRead = fixture.indicator.readCancellable;
    await fixture.finish(0, 1000000, 0);
    assert.equal(fixture.indicator.ioSpeed.text, "0B/s");
    assert.equal(fixture.indicator.sampler.previousCounters, null);
    assert.equal(fixture.indicator.readCancellable, activeRead);
    await fixture.finish(1, 1000, 0);
    fixture.tick();
    await fixture.finish(2, 3000, 2);
    assert.equal(fixture.indicator.ioSpeed.text, "512K/s");
});

test("failed reads turn the LED off, log once per series, and a later tick can retry", async (t) => {
    const fixture = createIndicator(t);
    const { indicator } = fixture;
    await fixture.finish(0, 1000, 0);
    fixture.tick();
    await fixture.finish(1, 3000, 2);
    assert.equal(indicator.ioSpeedIcon.opacity, 255);
    fixture.tick();
    await fixture.fail(2);
    assert.equal(indicator.ioSpeed.text, "--");
    assert.equal(indicator.ioSpeedIcon.opacity, 0);
    assert.equal(indicator.readCancellable, null);
    assert.equal(fixture.errors.length, 1);
    assert.equal(fixture.errors[0][0], "Failed to read disk statistics");
    assert.equal(fixture.errors[0][1].message, "disk read failed");
    fixture.tick();
    await fixture.fail(3);
    assert.equal(fixture.errors.length, 1);
    fixture.settings.set_int("mode", 1);
    assert.equal(indicator.ioSpeed.text, "--");
    fixture.tick();
    await fixture.finish(4, 7000, 6);
    assert.equal(indicator.ioSpeed.text, "512K/s");
    fixture.tick();
    await fixture.fail(5);
    assert.equal(fixture.errors.length, 2);
});

test("cancellation errors arriving after disable do not update destroyed widgets", async (t) => {
    const fixture = createIndicator(t);
    fixture.indicator.disable();
    await fixture.fail(0);
    assert.equal(fixture.indicator.ioSpeed, null);
    assert.equal(fixture.indicator.readCancellable, null);
    assert.equal(fixture.errors.length, 0);
});

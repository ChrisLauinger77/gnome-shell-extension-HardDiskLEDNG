import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../harddiskledNG@lauinger-clan.de/extension.js", import.meta.url), "utf8");

function createIndicator() {
    // Stub GI imports while exercising the actual refresh and display logic.
    const Extension = runInNewContext(
        source.replace(/^import .*;\n/gm, "").replace("export default class", "class") + "\nHardDiskLEDExtension;",
        {
            Extension: class {},
            TextDecoder,
            Gio: {
                file_new_for_path() {
                    return {
                        load_contents() {
                            return [true, new TextEncoder().encode("   8 0 sda 1 0 3000 0 1 0 0 0 0 0 0\n")];
                        },
                    };
                },
            },
        }
    );
    const indicator = new Extension();
    indicator.ioSpeed = createActor();
    indicator.ioSpeedStaticIcon = createActor();
    indicator.ioSpeedIcon = createActor();
    return indicator;
}

function createActor() {
    // Clutter actors expose show()/hide(), not Gtk's set_visible().
    return {
        visible: true,
        text: "",
        show() {
            this.visible = true;
        },
        hide() {
            this.visible = false;
        },
        set_text(text) {
            this.text = text;
        },
    };
}

test("disk activity renders every display mode using Shell actor visibility methods", () => {
    const indicator = createIndicator();
    // Columns: mode, speed visible, disk icon visible, LED visible, active LED.
    const modes = [
        [0, true, true, true, "●"],
        [1, true, true, true, "⬤"],
        [2, false, true, true, "●"],
        [3, false, true, true, "⬤"],
        [4, true, false, true, "●"],
        [5, true, false, false, " "],
        [6, false, false, true, "●"],
        [7, false, false, true, "⬤"],
    ];

    for (const [mode, speedVisible, iconVisible, ledVisible, dot] of [...modes, ...modes.slice().reverse()]) {
        indicator.mode = mode;
        indicator.lastCount = 1000;
        indicator.lastSpeed = 0;
        assert.equal(indicator.parseStat(true), true);
        assert.equal(indicator.ioSpeed.text, "512K/s", `mode ${mode}: refresh failed`);
        assert.equal(indicator.ioSpeed.visible, speedVisible, `mode ${mode}: speed visibility`);
        assert.equal(indicator.ioSpeedStaticIcon.visible, iconVisible, `mode ${mode}: disk icon visibility`);
        assert.equal(indicator.ioSpeedIcon.visible, ledVisible, `mode ${mode}: LED visibility`);
        assert.equal(indicator.ioSpeedIcon.text, dot, `mode ${mode}: LED glyph`);
    }
});

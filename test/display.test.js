import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { DiskStatsSampler, parseDiskStats } from "../harddiskledNG@lauinger-clan.de/lib/diskStats.js";

const source = readFileSync(new URL("../harddiskledNG@lauinger-clan.de/extension.js", import.meta.url), "utf8");

function createIndicator() {
    let contents = diskLine(8, 0, "sda", 1000);
    let time = 0;
    const devices = [
        { name: "sda", target: "../devices/pci0000:00/ata1/block/sda" },
        { name: "nvme0n1", target: "../devices/pci0000:00/nvme/nvme0/nvme0n1" },
        { name: "loop16", target: "../devices/virtual/block/loop16" },
    ];
    // Stub GI imports while exercising the actual refresh and display logic.
    const Extension = runInNewContext(
        source.replace(/^import .*;\n/gm, "").replace("export default class", "class") + "\nHardDiskLEDNGExtension;",
        {
            Extension: class {},
            TextDecoder,
            DiskStatsSampler,
            parseDiskStats,
            GLib: { get_monotonic_time: () => time * 1000000 },
            Gio: {
                FileQueryInfoFlags: { NOFOLLOW_SYMLINKS: 1 },
                File: {
                    new_for_path(path) {
                        if (path === "/sys/block") {
                            return {
                                enumerate_children() {
                                    let index = 0;
                                    return {
                                        next_file() {
                                            const device = devices[index++];
                                            if (!device) return null;
                                            return {
                                                get_name: () => device.name,
                                                get_symlink_target: () => device.target,
                                            };
                                        },
                                        close() {},
                                    };
                                },
                            };
                        }
                        assert.equal(path, "/proc/diskstats");
                        return { load_contents: () => [true, new TextEncoder().encode(contents)] };
                    },
                },
            },
        }
    );
    const indicator = new Extension();
    indicator.ioSpeed = createActor();
    indicator.ioSpeedStaticIcon = createActor();
    indicator.ioSpeedIcon = createActor();
    indicator.sampler = new DiskStatsSampler();
    indicator.lastSpeed = 0;
    indicator.mode = 0;
    return {
        indicator,
        setSample(nextContents, nextTime) {
            contents = nextContents;
            time = nextTime;
        },
    };
}

function diskLine(major, minor, name, read) {
    return `${major} ${minor} ${name} 1 0 ${read} 0 1 0 0 0 0 0 0\n`;
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
    const { indicator, setSample } = createIndicator();
    indicator.parseStat(true);
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

    let sample = 0;
    for (const [mode, speedVisible, iconVisible, ledVisible, dot] of [...modes, ...modes.slice().reverse()]) {
        sample++;
        setSample(diskLine(8, 0, "sda", 1000 + sample * 2000), sample * 2);
        indicator.mode = mode;
        assert.equal(indicator.parseStat(true), true);
        assert.equal(indicator.ioSpeed.text, "512K/s", `mode ${mode}: refresh failed`);
        assert.equal(indicator.ioSpeed.visible, speedVisible, `mode ${mode}: speed visibility`);
        assert.equal(indicator.ioSpeedStaticIcon.visible, iconVisible, `mode ${mode}: disk icon visibility`);
        assert.equal(indicator.ioSpeedIcon.visible, ledVisible, `mode ${mode}: LED visibility`);
        assert.equal(indicator.ioSpeedIcon.text, dot, `mode ${mode}: LED glyph`);
    }
});

test("sysfs disk selection includes NVMe minor 4 and excludes partitions and virtual disks", () => {
    const { indicator, setSample } = createIndicator();
    setSample(
        diskLine(8, 0, "sda", 1000) +
            diskLine(259, 4, "nvme0n1", 2000) +
            diskLine(259, 5, "nvme0n1p1", 2000) +
            diskLine(7, 16, "loop16", 5000),
        0
    );
    assert.deepEqual([...indicator.readDiskStats().keys()], ["8:0:sda", "259:4:nvme0n1"]);
});

test("changing display mode reuses the current speed without advancing the disk sample", () => {
    const { indicator, setSample } = createIndicator();
    indicator.parseStat(true);
    setSample(diskLine(8, 0, "sda", 3000), 2);
    indicator.parseStat(true);
    const previousCounters = indicator.sampler.previousCounters;
    setSample(diskLine(8, 0, "sda", 3001), 2.1);
    indicator.settings = { get_int: () => 7 };
    indicator.onModeChanged();
    assert.equal(indicator.mode, 7);
    assert.equal(indicator.ioSpeed.text, "512K/s");
    assert.equal(indicator.ioSpeedIcon.text, "⬤");
    assert.equal(indicator.sampler.previousTime, 2);
    assert.equal(indicator.sampler.previousCounters, previousCounters);
});

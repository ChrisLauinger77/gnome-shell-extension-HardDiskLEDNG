import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";
import { runInNewContext } from "node:vm";
import { parseDiskStats } from "../harddiskledNG@lauinger-clan.de/lib/diskStats.js";

const source = readFileSync(
    new URL("../harddiskledNG@lauinger-clan.de/lib/diskStatsReader.js", import.meta.url),
    "utf8"
);

function createReader({ extraDevices = 0, cancelAt = null, failAt = null } = {}) {
    const events = [];
    let cancelled = false;
    const cancellable = { is_cancelled: () => cancelled };
    const devices = [
        { name: "sda", target: "../devices/pci0000:00/ata1/block/sda" },
        { name: "nvme0n1", target: "../devices/pci0000:00/nvme/nvme0/nvme0n1" },
        { name: "loop16", target: "../devices/virtual/block/loop16" },
        ...Array.from({ length: extraDevices }, (_, i) => ({
            name: `sdx${i}`,
            target: `../devices/pci0000:00/block/sdx${i}`,
        })),
    ];
    const contents = new TextEncoder().encode(
        [
            "8 0 sda 1 0 1000 0 1 0 2000 0 0 0 0",
            "259 4 nvme0n1 1 0 3000 0 1 0 4000 0 0 0 0",
            "259 5 nvme0n1p1 1 0 3000 0 1 0 4000 0 0 0 0",
            "7 16 loop16 1 0 5000 0 1 0 6000 0 0 0 0",
        ].join("\n")
    );
    function deliver(stage, object, callback, value) {
        events.push(stage);
        if (stage === cancelAt) cancelled = true;
        Promise.resolve().then(() => callback(object, value));
    }
    function finish(stage, value) {
        if (stage === failAt) throw new Error(`${stage} failed`);
        if (cancelled && stage !== "close") throw new Error("cancelled");
        return value;
    }
    let offset = 0;
    const enumerator = {
        next_files_async(count, _priority, token, callback) {
            assert.equal(token, cancellable);
            const batch = devices.slice(offset, offset + count).map((device) => ({
                get_name: () => device.name,
                get_symlink_target: () => device.target,
            }));
            offset += count;
            deliver("next", enumerator, callback, batch);
        },
        next_files_finish: (result) => finish("next", result),
        close_async(_priority, token, callback) {
            assert.equal(token, null, "Cleanup must not use the cancelled token");
            deliver("close", enumerator, callback, true);
        },
        close_finish: (result) => finish("close", result),
    };
    const directory = {
        enumerate_children_async(_attributes, _flags, _priority, token, callback) {
            assert.equal(token, cancellable);
            deliver("open", directory, callback, enumerator);
        },
        enumerate_children_finish: (result) => finish("open", result),
    };
    const file = {
        load_contents_async(token, callback) {
            assert.equal(token, cancellable);
            deliver("load", file, callback, [true, contents]);
        },
        load_contents_finish: (result) => finish("load", result),
    };
    const reader = runInNewContext(
        source.replace(/^import .*;\n/gm, "").replace("export async function", "async function") + "\nreadDiskStats;",
        {
            TextDecoder,
            parseDiskStats,
            GLib: { PRIORITY_DEFAULT: 0 },
            Gio: {
                FileQueryInfoFlags: { NOFOLLOW_SYMLINKS: 1 },
                File: {
                    new_for_path(path) {
                        if (path === "/sys/block") return directory;
                        assert.equal(path, "/proc/diskstats");
                        return file;
                    },
                },
            },
        }
    );
    return { read: () => reader(cancellable), events };
}

test("asynchronous reads select physical whole disks and close the enumerator", async () => {
    const fixture = createReader();
    assert.deepEqual([...(await fixture.read()).keys()], ["8:0:sda", "259:4:nvme0n1"]);
    assert.deepEqual(fixture.events, ["open", "next", "next", "close", "load"]);
});

test("asynchronous enumeration reads every batch", async () => {
    const fixture = createReader({ extraDevices: 70 });
    await fixture.read();
    assert.equal(fixture.events.filter((event) => event === "next").length, 3);
    assert.equal(fixture.events.filter((event) => event === "close").length, 1);
});

test("cancellation at each I/O stage rejects the read and releases acquired resources", async () => {
    await Promise.all(
        ["open", "next", "load"].map(async (stage) => {
            const fixture = createReader({ cancelAt: stage });
            await assert.rejects(fixture.read(), /cancelled/);
            assert.equal(fixture.events.includes("close"), stage !== "open");
            if (stage === "next") assert.equal(fixture.events.includes("load"), false);
        })
    );
});

test("a failed enumeration still closes its enumerator", async () => {
    const fixture = createReader({ failAt: "next" });
    await assert.rejects(fixture.read(), /next failed/);
    assert.deepEqual(fixture.events, ["open", "next", "close"]);
});

test("failed diskstats reads propagate their error", async () => {
    const fixture = createReader({ failAt: "load" });
    await assert.rejects(fixture.read(), /load failed/);
    assert.equal(fixture.events.includes("close"), true);
});

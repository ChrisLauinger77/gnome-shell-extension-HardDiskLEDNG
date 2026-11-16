import assert from "node:assert/strict";
import { test } from "node:test";
import { DiskStatsSampler, parseDiskStats } from "../harddiskledNG@lauinger-clan.de/lib/diskStats.js";

function counters(devices) {
    return new Map(Object.entries(devices).map(([id, [read, written]]) => [id, { read, written }]));
}

test("diskstats parsing accepts arbitrary minor numbers and whitespace", () => {
    const contents = [
        "   8 0 sda 1 0 1000 0 1 0 2000 0 0 0 0",
        "",
        "259\t4\tnvme0n1\t1\t0\t3000\t0\t1\t0\t4000\t0\t0\t0\t0",
        "259 5 nvme0n1p1 1 0 3000 0 1 0 4000 0 0 0 0",
        "7 16 loop16 1 0 5000 0 1 0 6000 0 0 0 0",
    ].join("\n");
    assert.deepEqual(
        parseDiskStats(contents, new Set(["sda", "nvme0n1"])),
        counters({ "8:0:sda": [1000, 2000], "259:4:nvme0n1": [3000, 4000] })
    );
});

test("rates combine reads and writes using actual elapsed time", () => {
    const sampler = new DiskStatsSampler();
    assert.equal(sampler.sample(counters({ sda: [100, 50] }), 0), 0);
    assert.equal(sampler.sample(counters({ sda: [120, 60] }), 0.5), 30720);
    assert.equal(sampler.sample(counters({ sda: [220, 110] }), 2), 51200);
});

test("first activity after zero counters is counted", () => {
    const sampler = new DiskStatsSampler();
    assert.equal(sampler.sample(counters({ sda: [0, 0] }), 0), 0);
    assert.equal(sampler.sample(counters({ sda: [2000, 0] }), 2), 512000);
});

test("read or write counter resets do not generate negative rates or mask another disk", () => {
    for (const reset of [
        [0, 20000],
        [20000, 0],
    ]) {
        const sampler = new DiskStatsSampler();
        sampler.sample(counters({ sda: [10000, 10000], nvme: [100, 100] }), 0);
        assert.equal(sampler.sample(counters({ sda: reset, nvme: [1100, 100] }), 2), 256000);
        assert.equal(sampler.sample(counters({ sda: [reset[0] + 100, reset[1] + 100], nvme: [1100, 100] }), 4), 51200);
    }
});

test("adding, removing, and replacing disks does not create rate spikes", () => {
    const sampler = new DiskStatsSampler();
    sampler.sample(counters({ "8:0:sda": [1000, 0] }), 0);
    assert.equal(sampler.sample(counters({ "8:0:sda": [2000, 0], "259:4:nvme0n1": [1000000, 0] }), 2), 256000);
    assert.equal(sampler.sample(counters({ "259:4:nvme0n1": [1002000, 0] }), 4), 512000);
    assert.equal(sampler.sample(counters({ "259:7:nvme0n1": [5000000, 0] }), 6), 0);
    assert.equal(sampler.sample(counters({ "259:7:nvme0n1": [5002000, 0] }), 8), 512000);
});

test("samples with no elapsed time return a finite zero rate", () => {
    const sampler = new DiskStatsSampler();
    sampler.sample(counters({ sda: [1000, 0] }), 0);
    assert.equal(sampler.sample(counters({ sda: [2000, 0] }), 0), 0);
});

export function parseDiskStats(contents, devices) {
    const counters = new Map();
    for (const line of contents.split("\n")) {
        const fields = line.trim().split(/\s+/);
        if (fields.length < 10 || !devices.has(fields[2])) continue;

        const read = Number(fields[5]);
        const written = Number(fields[9]);
        if (!Number.isSafeInteger(read) || !Number.isSafeInteger(written) || read < 0 || written < 0) continue;

        counters.set(`${fields[0]}:${fields[1]}:${fields[2]}`, { read, written });
    }
    return counters;
}

export class DiskStatsSampler {
    previousCounters = null;
    previousTime = null;

    sample(counters, time) {
        const previousCounters = this.previousCounters;
        const previousTime = this.previousTime;
        this.previousCounters = counters;
        this.previousTime = time;
        if (previousCounters === null || time <= previousTime) return 0;

        let sectors = 0;
        for (const [device, current] of counters) {
            const previous = previousCounters.get(device);
            if (!previous || current.read < previous.read || current.written < previous.written) continue;

            sectors += current.read - previous.read + current.written - previous.written;
        }
        return (sectors * 512) / (time - previousTime);
    }
}

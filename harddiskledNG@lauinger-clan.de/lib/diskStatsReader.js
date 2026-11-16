import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { parseDiskStats } from "./diskStats.js";

function openDevices(cancellable) {
    const directory = Gio.File.new_for_path("/sys/block");
    return new Promise((resolve, reject) => {
        directory.enumerate_children_async(
            "standard::name,standard::symlink-target",
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT,
            cancellable,
            (file, result) => {
                try {
                    resolve(file.enumerate_children_finish(result));
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

function nextDevices(enumerator, cancellable) {
    return new Promise((resolve, reject) => {
        enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, cancellable, (iter, result) => {
            try {
                resolve(iter.next_files_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function closeDevices(enumerator) {
    return new Promise((resolve, reject) => {
        // Closing must still complete when the read's cancellable was cancelled.
        enumerator.close_async(GLib.PRIORITY_DEFAULT, null, (iter, result) => {
            try {
                resolve(iter.close_finish(result));
            } catch (error) {
                reject(error);
            }
        });
    });
}

function loadContents(cancellable) {
    const file = Gio.File.new_for_path("/proc/diskstats");
    return new Promise((resolve, reject) => {
        file.load_contents_async(cancellable, (input, result) => {
            try {
                const [, contents] = input.load_contents_finish(result);
                resolve(contents);
            } catch (error) {
                reject(error);
            }
        });
    });
}

export async function readDiskStats(cancellable) {
    const devices = new Set();
    const enumerator = await openDevices(cancellable);
    try {
        let batch;
        do {
            // eslint-disable-next-line no-await-in-loop -- Each batch advances the same enumerator cursor.
            batch = await nextDevices(enumerator, cancellable);
            for (const info of batch) {
                // sysfs replaces "/" in device names with "!", /proc/diskstats keeps the "/"
                if (!info.get_symlink_target().includes("/virtual/")) devices.add(info.get_name().replaceAll("!", "/"));
            }
        } while (batch.length > 0);
    } finally {
        await closeDevices(enumerator);
    }

    const contents = await loadContents(cancellable);
    return parseDiskStats(new TextDecoder().decode(contents), devices);
}

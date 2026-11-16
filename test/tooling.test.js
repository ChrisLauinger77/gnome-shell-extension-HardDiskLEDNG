import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, URL } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const extension = "harddiskledNG@lauinger-clan.de";

function fixture(t) {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), "harddiskledng-test-"));
    const directory = join(temporaryDirectory, "checkout with spaces");
    mkdirSync(directory);
    t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
    for (const name of [".githooks", extension, "harddiskledng.sh", "package.json", "package-lock.json", "LICENSE"]) {
        cpSync(join(repoRoot, name), join(directory, name), { recursive: true });
    }

    const run = (command, args, options = {}) =>
        spawnSync(command, args, { cwd: directory, encoding: "utf8", ...options });
    const helper = (action, options) => run("bash", [join(directory, "harddiskledng.sh"), action], options);
    return { directory, run, helper };
}

function readJson(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
    writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function assertSuccess(result) {
    assert.equal(result.status, 0, result.stdout + result.stderr);
}

function mockGnome(directory) {
    const commands = join(directory, "mockbin");
    const log = join(directory, "commands.log");
    mkdirSync(commands);
    writeFileSync(
        join(commands, "gnome-extensions"),
        '#!/bin/bash\nprintf "%s\\n" "cwd=$PWD" "command=$1" "$@" >> "$COMMAND_LOG"\nexit "$PACK_STATUS"\n',
        { mode: 0o755 }
    );
    return { ...process.env, PATH: `${commands}:${process.env.PATH}`, COMMAND_LOG: log, PACK_STATUS: "0" };
}

test("version updates normalize metadata and repair both lockfile versions", (t) => {
    const { directory, helper } = fixture(t);
    assertSuccess(helper("check-version"));
    const metadataPath = join(directory, extension, "metadata.json");
    const metadata = readJson(metadataPath);
    metadata["version-name"] = "51.2";
    writeJson(metadataPath, metadata);
    assert.notEqual(helper("check-version").status, 0);
    assertSuccess(helper("update-version"));
    assert.equal(readJson(join(directory, "package.json")).version, "51.2.0");

    const lockPath = join(directory, "package-lock.json");
    const lock = readJson(lockPath);
    assert.equal(lock.version, "51.2.0");
    assert.equal(lock.packages[""].version, "51.2.0");
    lock.packages[""].version = "50.0.0";
    writeJson(lockPath, lock);
    assert.notEqual(helper("check-version").status, 0);
    assertSuccess(helper("update-version"));
    assertSuccess(helper("check-version"));
});

test("invalid metadata versions leave npm files unchanged", (t) => {
    const { directory, helper } = fixture(t);
    const packagePath = join(directory, "package.json");
    const lockPath = join(directory, "package-lock.json");
    const originalPackage = readFileSync(packagePath, "utf8");
    const originalLock = readFileSync(lockPath, "utf8");
    const metadataPath = join(directory, extension, "metadata.json");
    const metadata = readJson(metadataPath);
    metadata["version-name"] = "invalid";
    writeJson(metadataPath, metadata);
    const result = helper("update-version");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid metadata.json version-name/);
    assert.equal(readFileSync(packagePath, "utf8"), originalPackage);
    assert.equal(readFileSync(lockPath, "utf8"), originalLock);
});

test("optional hook validates staged versions even when working files match", (t) => {
    const { directory, run, helper } = fixture(t);
    assertSuccess(run("git", ["init", "--quiet"]));
    assertSuccess(run("git", ["add", `${extension}/metadata.json`, "package.json", "package-lock.json"]));
    assertSuccess(helper("setup-hooks"));
    assert.equal(run("git", ["config", "--local", "core.hooksPath"]).stdout.trim(), ".githooks");
    const hook = join(directory, ".githooks", "pre-commit");
    assertSuccess(run(hook, []));

    const metadataPath = join(directory, extension, "metadata.json");
    const originalMetadata = readFileSync(metadataPath, "utf8");
    const metadata = readJson(metadataPath);
    metadata["version-name"] = "51.3.0";
    writeJson(metadataPath, metadata);
    assertSuccess(run("git", ["add", `${extension}/metadata.json`]));
    writeFileSync(metadataPath, originalMetadata);
    assertSuccess(helper("check-version"));
    assert.notEqual(run(hook, []).status, 0);

    assertSuccess(run("git", ["add", `${extension}/metadata.json`]));
    const lockPath = join(directory, "package-lock.json");
    const originalLock = readFileSync(lockPath, "utf8");
    const lock = readJson(lockPath);
    lock.packages[""].version = "50.0.0";
    writeJson(lockPath, lock);
    assertSuccess(run("git", ["add", "package-lock.json"]));
    writeFileSync(lockPath, originalLock);
    assertSuccess(helper("check-version"));
    assert.notEqual(run(hook, []).status, 0);
});

test("pack uses the extension directory and only includes existing translations", (t) => {
    const { directory, helper } = fixture(t);
    const env = mockGnome(directory);
    assertSuccess(helper("pack", { cwd: tmpdir(), env }));
    let log = readFileSync(env.COMMAND_LOG, "utf8");
    assert.ok(log.includes(`cwd=${join(directory, extension)}\n`));
    assert.ok(log.includes(`--out-dir=${directory}\n`));
    assert.ok(!log.includes("--podir="));
    assert.ok(!log.includes("--extra-source=./lib"));

    mkdirSync(join(directory, "po"));
    writeFileSync(join(directory, "po", "fr.po"), "");
    writeFileSync(env.COMMAND_LOG, "");
    assertSuccess(helper("pack", { env }));
    log = readFileSync(env.COMMAND_LOG, "utf8");
    assert.ok(log.includes("--podir=../po/\n"));
});

test("packing failures stop pack, install, and upload without reporting success", (t) => {
    const { directory, helper } = fixture(t);
    const env = { ...mockGnome(directory), PACK_STATUS: "42" };
    for (const action of ["pack", "install", "upload"]) {
        writeFileSync(env.COMMAND_LOG, "");
        const result = helper(action, { env });
        assert.equal(result.status, 42, result.stdout + result.stderr);
        assert.doesNotMatch(result.stdout, /Extension zip (created|installed)/);
        const log = readFileSync(env.COMMAND_LOG, "utf8");
        assert.match(log, /command=pack\n/);
        assert.doesNotMatch(log, /command=(install|enable|upload)\n/);
    }
});

test("install rebuilds an existing archive before installing the correct UUID", (t) => {
    const { directory, helper } = fixture(t);
    const env = mockGnome(directory);
    writeFileSync(join(directory, `${extension}.shell-extension.zip`), "stale archive");
    assertSuccess(helper("install", { env }));
    const log = readFileSync(env.COMMAND_LOG, "utf8");
    assert.match(log, /command=pack[\s\S]*command=install[\s\S]*command=enable/);
    assert.ok(log.includes(`install\n${extension}.shell-extension.zip\n--force\n`));
    assert.ok(log.includes(`enable\n${extension}\n`));
});

test("pack accepts an explicit output directory from any working directory", (t) => {
    const { directory, run } = fixture(t);
    const env = mockGnome(directory);
    assertSuccess(
        run("bash", [join(directory, "harddiskledng.sh"), "pack", join(directory, "dist")], { cwd: tmpdir(), env })
    );
    assert.ok(readFileSync(env.COMMAND_LOG, "utf8").includes(`--out-dir=${join(directory, "dist")}\n`));
});

'use strict';

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
require('dotenv/config.js');
var EventEmitter = require('events');
var argparse = require('argparse');

function _interopNamespaceDefault(e) {
    var n = Object.create(null);
    if (e) {
        Object.keys(e).forEach(function (k) {
            if (k !== 'default') {
                var d = Object.getOwnPropertyDescriptor(e, k);
                Object.defineProperty(n, k, d.get ? d : {
                    enumerable: true,
                    get: function () { return e[k]; }
                });
            }
        });
    }
    n.default = e;
    return Object.freeze(n);
}

var child_process__namespace = /*#__PURE__*/_interopNamespaceDefault(child_process);
var fs__namespace = /*#__PURE__*/_interopNamespaceDefault(fs);
var argparse__namespace = /*#__PURE__*/_interopNamespaceDefault(argparse);

async function delay(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}
async function execute(command, args, options) {
    console.log(`[${path.parse(command).base}]: Starting process`);
    if (options.stdoutPath) {
        await fs__namespace.promises.mkdir(path.parse(options.stdoutPath).dir, {
            recursive: true
        });
    }
    const childProcess = child_process__namespace.spawn(command, args, {
        cwd: options.cwd,
    });
    const stdout = childProcess.stdout;
    let stream;
    if (options.stdoutPath && stdout) {
        stream = fs__namespace.createWriteStream(options.stdoutPath);
        childProcess.stdout?.pipe(stream);
    }
    else {
        childProcess.stdout.pipe(process.stdout);
    }
    childProcess.stderr.on("data", e => {
        console.error(`[${path.parse(command).base}]: ${e}`);
    });
    await new Promise(resolve => {
        function exit(code) {
            stream?.close();
            console.log(`[${path.parse(command).base}]: Exit with code ${code}`);
            childProcess.off("exit", exit);
            resolve();
        }
        childProcess.on("exit", exit);
    });
}
function getPathFromLibraryRoot(relPath) {
    return path.join(__dirname, "lib", relPath);
}
function isWithin(outer, inner) {
    const rel = path.relative(outer, inner);
    return !!rel && !rel.startsWith('..' + path.sep) && rel !== '..';
}

async function executeSniffer(abortController, saveDir) {
    await fs__namespace.promises.mkdir(saveDir, {
        recursive: true,
    });
    while (!abortController.signal.aborted) {
        try {
            const data = await (await import('clipboardy')).default.read();
            const filename = path.join(saveDir, `${new Date().toUTCString().replace(/\W/g, "_")}.txt`);
            await fs__namespace.promises.writeFile(filename, data);
        }
        catch (e) {
            console.error(e);
        }
        await delay(1);
    }
}
function sniffClipboard(parameters) {
    const unboundedDuration = parameters.duration ?? Infinity;
    const duration = unboundedDuration < (2 ** 32 - 1) ? unboundedDuration : Infinity;
    const abortController = new AbortController();
    executeSniffer(abortController, path.join(parameters.outDir, "clipboard")).then();
    if (duration !== Infinity) {
        setTimeout(() => {
            abortController.abort();
        }, duration * 1000);
    }
    return abortController;
}

class PsUtils {
    getBaseArgs() {
        return ["/accepteula", "-nobanner"];
    }
    async getProcessList(params) {
        await execute(getPathFromLibraryRoot("./psutils/pslist64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "processes.txt")
        });
    }
    async getLoggedOnUsers(params) {
        await execute(getPathFromLibraryRoot("./psutils/PsLoggedon64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "logged_on_users.txt")
        });
    }
    async getServices(params) {
        await execute(getPathFromLibraryRoot("./psutils/PsService64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "services.txt")
        });
    }
}
async function getIpConfig(params) {
    await execute("ipconfig", [], {
        stdoutPath: path.join(params.outDir, "ipconfig.txt")
    });
}
async function getPromiscuousAdapters(params) {
    await execute(getPathFromLibraryRoot("network/promiscdetect"), [], {
        stdoutPath: path.join(params.outDir, "promiscuous_adapters.txt")
    });
}
async function memoryDump(params) {
    await execute(getPathFromLibraryRoot("memory/comae/x64/dumpit"), ["/r", "/q", "/o", path.join(params.outDir, "memory_dump.zdmp")], {});
}

class PromisePool {
    constructor(maxTasks = 20) {
        this._maxTasks = 500;
        this._pool = new Set();
        this._emitter = new EventEmitter();
        this._maxTasks = maxTasks;
    }
    async execute(callback) {
        // Repeated callback instances will not interfere with each other.
        const uniqueCallback = () => callback();
        return await this._execute(uniqueCallback);
    }
    async _waitUntilPoolReady() {
        while (this._pool.size >= this._maxTasks) {
            await new Promise((resolve) => {
                const resolver = () => {
                    resolve();
                    this._emitter.off("taskComplete", resolver);
                };
                this._emitter.on("taskComplete", resolver);
            });
        }
    }
    async _execute(callback) {
        await this._waitUntilPoolReady();
        const promise = callback();
        this._pool.add(promise);
        try {
            return await promise;
        }
        finally {
            this._pool.delete(promise);
            this._emitter.emit("taskComplete");
        }
    }
}

const OUT_DIR = path.join(process.cwd(), "output");

function scanEntireDirectory(directory = "C:\\", extensions) {
    const extensionSet = new Set(extensions);
    async function* scanDirectory(targetDir) {
        try {
            const entries = await fs__namespace.promises.readdir(targetDir);
            for (let entry of entries) {
                const actualPath = path.join(targetDir, entry);
                try {
                    const stat = await fs__namespace.promises.stat(actualPath);
                    if (stat.isDirectory()) {
                        for await (let childFile of scanDirectory(actualPath)) {
                            yield childFile;
                        }
                    }
                    else if (extensionSet.has(path.parse(actualPath).ext)) {
                        yield actualPath;
                    }
                }
                catch (e) {
                    console.error(e);
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    }
    return scanDirectory(directory);
}
async function extractDirectory(directory, saveDir, extensions) {
    const pool = new PromisePool(100);
    const startTime = performance.now();
    let filesCopied = 0;
    for await (let file of scanEntireDirectory(directory, extensions)) {
        // Never copy or duplicate itself.
        if (isWithin(OUT_DIR, file)) {
            console.warn(`Skipping file ${file} as it overlaps with ${OUT_DIR}. 
Avoid setting output directory file inside the directory to be scanned.`);
            continue;
        }
        const destPath = path.join(saveDir, "extracted_files", file.replaceAll(":", ""));
        const task = async () => {
            await fs__namespace.promises.cp(file, destPath, {
                recursive: true,
            });
            filesCopied++;
            const endTime = performance.now();
            console.log(`Files copied: ${filesCopied}, Copy speed: ${filesCopied / ((endTime - startTime) / 1000)} files/second`);
        };
        await pool.execute(task);
    }
}

const parser = new argparse__namespace.ArgumentParser();
parser.add_argument('--targets', {
    help: "Target directories. File scanner will work in these directories.",
    nargs: "*",
    default: ["C:\\"],
});
parser.add_argument('--extensions', {
    help: "List of extensions to filter",
    nargs: "*",
    default: [".png", ".jpg", ".jpeg"],
});
parser.add_argument('--save-location', {
    help: "The location to save logs of installed tools and extracted files.",
    default: path.join(process.cwd(), "output"),
});
parser.add_argument('--ram-dump', {
    help: "Enable dumping RAM onto disk.",
    default: "on",
});
const _args = parser.parse_args();
const args = {
    targets: _args.targets,
    extensions: _args.extensions,
    save_location: _args.save_location,
    ram_dump: _args.ram_dump === "on",
};
console.log(args);
async function main() {
    // First step - enable clipboard sniffing.
    const clipboardHandle = sniffClipboard({
        outDir: path.join(args.save_location),
        duration: Infinity,
    });
    // Second step - get running processes and multiple other volatile data from memory like current users, network connections, and so on.
    const psutils = new PsUtils();
    const volatileFetchSteps = [
        psutils.getProcessList({
            outDir: args.save_location,
        }),
        psutils.getLoggedOnUsers({
            outDir: args.save_location,
        }),
        psutils.getServices({
            outDir: args.save_location,
        }),
        getIpConfig({
            outDir: args.save_location,
        }),
        getPromiscuousAdapters({
            outDir: args.save_location,
        }),
    ];
    await Promise.all(volatileFetchSteps);
    // Step 3: Complete memory dump. Takes quite some time.
    if (args.ram_dump) {
        await memoryDump({
            outDir: args.save_location
        });
    }
    // Step 4: Perform a disk copy of all files like documents or images.
    for (let target of args.targets) {
        console.log(target);
        await extractDirectory(target, args.save_location, args.extensions);
    }
    // Step 5: Cleanup.
    clipboardHandle.abort("End script - stopping clipboard sniffer.");
}
main().then();

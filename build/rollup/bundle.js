'use strict';

var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var url = require('url');
var clipboard$1 = require('@napi-rs/clipboard');
require('dotenv/config.js');
var EventEmitter = require('events');
var argparse = require('argparse');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
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

let EXECUTABLE_DIRECTORY;
// Detect if in pkg executable
// @ts-ignore
if (process.pkg?.entrypoint) {
    EXECUTABLE_DIRECTORY = path.dirname(process.execPath);
}
else {
    try {
        EXECUTABLE_DIRECTORY = __dirname;
    }
    catch (e) {
        EXECUTABLE_DIRECTORY = path.dirname(url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.src || new URL('bundle.js', document.baseURI).href))));
    }
}
let LIBRARY_PATH = path.join(EXECUTABLE_DIRECTORY, "lib");
async function delay(seconds) {
    return new Promise(resolve => {
        setTimeout(resolve, seconds * 1000);
    });
}
async function execute(command, args, options) {
    console.log(`[${path.parse(command).base}]: Starting process with args ${args.join(" ")}`);
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
    return path.join(LIBRARY_PATH, relPath);
}
function isWithin(outer, inner) {
    const rel = path.relative(outer, inner);
    return !!rel && !rel.startsWith('..' + path.sep) && rel !== '..';
}

const clipboard = new clipboard$1.Clipboard();
async function executeSniffer(abortController, saveDir) {
    await fs__namespace.promises.mkdir(saveDir, {
        recursive: true,
    });
    while (!abortController.signal.aborted) {
        try {
            const data = clipboard.getText();
            const filename = path.join(saveDir, `${new Date().toUTCString().replace(/\W/g, "_")}.txt`);
            await fs__namespace.promises.writeFile(filename, data);
        }
        catch (e) {
            console.error(e);
        }
        await delay(10);
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
    async getSystemLogs(params) {
        await execute(getPathFromLibraryRoot("./psutils/psloglist64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "system_logs.txt")
        });
    }
    async getServices(params) {
        await execute(getPathFromLibraryRoot("./psutils/PsService64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "services.txt")
        });
    }
    async getRemoteOpenFiles(params) {
        await execute(getPathFromLibraryRoot("./psutils/psfile64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "remote_open_files.txt")
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
async function getNetStat(params) {
    const args = ["-a", params.resolve_domains ? "-f" : "-n", "-o"];
    await execute("netstat", args, {
        stdoutPath: path.join(params.outDir, "netstat.txt")
    });
}
async function memoryDump(params) {
    await execute(getPathFromLibraryRoot("memory/comae/x64/dumpit"), ["/r", "/q", "/o", path.join(params.outDir, "memory_dump.zdmp")], {});
}
async function processDump(params) {
    await fs__namespace.promises.mkdir(path.join(params.outDir, "process_dumps"), {
        recursive: true
    });
    const args = ["-system", "-closemon", "-o", path.join(params.outDir, "process_dumps")];
    if (params.cleanDatabase) {
        args.push("-cdb", params.cleanDatabase);
    }
    await execute(getPathFromLibraryRoot("memory/processdump/pd64"), args, {});
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
        if (isWithin(saveDir, file)) {
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
parser.add_argument('--process-dump', {
    help: "Enable dumping running processes' executables onto disk.",
    default: "on",
});
parser.add_argument('--netstat-resolve-domains', {
    help: "Resolve domains for NetStat. Will cause step 2 to be longer if enabled.",
    default: "on",
});
parser.add_argument('--process-dump-clean-database', {
    help: "Path to a clean hash database from another clean computer to avoid having to dump redundant files.",
});
const _args = parser.parse_args();
const args = {
    targets: _args.targets,
    extensions: _args.extensions,
    save_location: _args.save_location,
    ram_dump: _args.ram_dump === "on",
    process_dump: _args.process_dump === "on",
    process_dump_clean_database: _args.process_dump_clean_database,
    netstat_resolve_domains: _args.netstat_resolve_domains === "on",
};
console.log(args);
async function main() {
    // First step - clipboard should be enabled.
    console.log("STEP 1 - enable clipboard sniffing");
    const clipboardHandle = sniffClipboard({
        outDir: path.join(args.save_location),
        duration: Infinity,
    });
    // Second step - get running processes and multiple other volatile data from memory like current users, network connections, and so on.
    console.log("STEP 2 - running basic volatile utilities");
    const psutils = new PsUtils();
    const volatileFetchSteps = [
        // Executable is psutils/pslist64
        psutils.getProcessList({
            outDir: args.save_location,
        }),
        // Executable is psutils/psloggedon64
        psutils.getLoggedOnUsers({
            outDir: args.save_location,
        }),
        // Executable is psutils/psservice64
        psutils.getServices({
            outDir: args.save_location,
        }),
        // Executable is psutils/psfile64
        psutils.getRemoteOpenFiles({
            outDir: args.save_location,
        }),
        // Executable is psutils/psloglist64
        psutils.getSystemLogs({
            outDir: args.save_location,
        }),
        // Executable is ipconfig
        getIpConfig({
            outDir: args.save_location,
        }),
        // Executable is network/promiscdetect
        getPromiscuousAdapters({
            outDir: args.save_location,
        }),
        // Executable is netstat
        getNetStat({
            outDir: args.save_location,
            resolve_domains: args.netstat_resolve_domains,
        }),
    ];
    await Promise.all(volatileFetchSteps);
    // Step 3: Process dump.
    console.log("STEP 3 - process dump");
    if (args.process_dump) {
        // Executable is memory/processdump/pd64
        await processDump({
            outDir: args.save_location,
            cleanDatabase: args.process_dump_clean_database,
        });
    }
    // Step 4: Complete memory dump. Takes quite some time.
    console.log("STEP 4 - complete memory dump");
    if (args.ram_dump) {
        // Executable is memory/comae/x64/dumpit
        await memoryDump({
            outDir: args.save_location
        });
    }
    // Step 5: Perform a disk copy of all files like documents or images.
    console.log("STEP 5 - extracting target files from disk");
    // Runs a custom NodeJS
    for (let target of args.targets) {
        console.log(target);
        await extractDirectory(target, args.save_location, args.extensions);
    }
    // Step 6: Cleanup.
    console.log("Cleaning up");
    clipboardHandle.abort("End script - stopping clipboard sniffer.");
}
main().then();

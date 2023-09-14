import sniffClipboard from "./clipboard.js";
import path from "path";
import 'dotenv/config.js';
import {getIpConfig, getNetStat, getPromiscuousAdapters, memoryDump, processDump, PsUtils} from "./volatile.js";
import {extractDirectory, scanEntireDirectory} from "./nonvolatile.js";
import * as argparse from 'argparse';

const parser = new argparse.ArgumentParser();

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
    targets: _args.targets as string[],
    extensions: _args.extensions as string[],
    save_location: _args.save_location as string,
    ram_dump: _args.ram_dump === "on",
    process_dump: _args.process_dump === "on",
    process_dump_clean_database: _args.process_dump_clean_database as string|undefined,
    netstat_resolve_domains: _args.netstat_resolve_domains === "on",
}

console.log(args)

async function main() {
    // First step - clipboard should be enabled.
    console.log("STEP 1 - enable clipboard sniffing")
    const clipboardHandle = sniffClipboard({
        outDir: path.join(args.save_location),
        duration: Infinity,
    });
    // Second step - get running processes and multiple other volatile data from memory like current users, network connections, and so on.
    console.log("STEP 2 - running basic volatile utilities")
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
    console.log("STEP 3 - process dump")
    if (args.process_dump) {
        // Executable is memory/processdump/pd64
        await processDump({
            outDir: args.save_location,
            cleanDatabase: args.process_dump_clean_database,
        });
    }
    // Step 4: Complete memory dump. Takes quite some time.
    console.log("STEP 4 - complete memory dump")
    if (args.ram_dump) {
        // Executable is memory/comae/x64/dumpit
        await memoryDump({
            outDir: args.save_location
        });
    }
    // Step 5: Perform a disk copy of all files like documents or images.
    console.log("STEP 5 - extracting target files from disk")
    // Runs a custom NodeJS
    for (let target of args.targets) {
        console.log(target);
        await extractDirectory(target, args.save_location, args.extensions);
    }
    // Step 6: Cleanup.
    console.log("Cleaning up")
    clipboardHandle.abort("End script - stopping clipboard sniffer.");
}

main().then();

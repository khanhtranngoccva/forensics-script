import sniffClipboard from "./clipboard.js";
import path from "path";
import 'dotenv/config.js';
import { getIpConfig, getNetStat, getPromiscuousAdapters, memoryDump, PsUtils } from "./volatile.js";
import { extractDirectory } from "./nonvolatile.js";
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
        getNetStat({
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

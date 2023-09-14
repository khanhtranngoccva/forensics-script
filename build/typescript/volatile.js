import { execute, getPathFromLibraryRoot } from "./helpers.js";
import path from "path";
import * as fs from "fs";
export class PsUtils {
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
export async function getIpConfig(params) {
    await execute("ipconfig", [], {
        stdoutPath: path.join(params.outDir, "ipconfig.txt")
    });
}
export async function getPromiscuousAdapters(params) {
    await execute(getPathFromLibraryRoot("network/promiscdetect"), [], {
        stdoutPath: path.join(params.outDir, "promiscuous_adapters.txt")
    });
}
export async function getNetStat(params) {
    const args = ["-a", params.resolve_domains ? "-f" : "-n", "-o"];
    await execute("netstat", args, {
        stdoutPath: path.join(params.outDir, "netstat.txt")
    });
}
export async function memoryDump(params) {
    await execute(getPathFromLibraryRoot("memory/comae/x64/dumpit"), ["/r", "/q", "/o", path.join(params.outDir, "memory_dump.zdmp")], {});
}
export async function processDump(params) {
    await fs.promises.mkdir(path.join(params.outDir, "process_dumps"), {
        recursive: true
    });
    const args = ["-system", "-closemon", "-o", path.join(params.outDir, "process_dumps")];
    if (params.cleanDatabase) {
        args.push("-cdb", params.cleanDatabase);
    }
    await execute(getPathFromLibraryRoot("memory/processdump/pd64"), args, {});
}

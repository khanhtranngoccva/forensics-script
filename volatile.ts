import {execute, getPathFromLibraryRoot} from "./helpers.js";
import path from "path";


export class PsUtils {
    getBaseArgs() {
        return ["/accepteula", "-nobanner"];
    }

    async getProcessList(params: {outDir: string}) {
        await execute(getPathFromLibraryRoot("./psutils/pslist64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "processes.txt")
        });
    }

    async getLoggedOnUsers(params: {outDir: string}) {
        await execute(getPathFromLibraryRoot("./psutils/PsLoggedon64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "logged_on_users.txt")
        });
    }

    async getServices(params: {outDir: string}) {
        await execute(getPathFromLibraryRoot("./psutils/PsService64"), [
            ...this.getBaseArgs(),
        ], {
            stdoutPath: path.join(params.outDir, "services.txt")
        });
    }
}

export async function getIpConfig(params: {outDir: string}) {
    await execute("ipconfig", [], {
        stdoutPath: path.join(params.outDir, "ipconfig.txt")
    });
}
export async function getPromiscuousAdapters(params: {outDir: string}) {
    await execute(getPathFromLibraryRoot("network/promiscdetect"), [], {
        stdoutPath: path.join(params.outDir, "promiscuous_adapters.txt")
    });
}

export async function memoryDump(params: {outDir: string}) {
    await execute(getPathFromLibraryRoot("memory/comae/x64/dumpit"), ["/r", "/q", "/o", path.join(params.outDir, "memory_dump.zdmp")], {});
}

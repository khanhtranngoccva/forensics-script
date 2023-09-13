import EventEmitter from "events";

type Callback<T> = () => Promise<T>;

export default class PromisePool<T> {
    protected readonly _maxTasks: number = 500;
    protected readonly _pool: Set<Promise<T>> = new Set();
    protected readonly _emitter = new EventEmitter();

    constructor(maxTasks = 20) {
        this._maxTasks = maxTasks;
    }

    async execute(callback: Callback<T>): Promise<T> {
        // Repeated callback instances will not interfere with each other.
        const uniqueCallback = () => callback();
        return await this._execute(uniqueCallback);
    }

    protected async _waitUntilPoolReady() {
        while (this._pool.size >= this._maxTasks) {
            await new Promise<void>((resolve) => {
                const resolver = () => {
                    resolve();
                    this._emitter.off("taskComplete", resolver);
                }
                this._emitter.on("taskComplete", resolver);
            })
        }
    }

    protected async _execute(callback: Callback<T>): Promise<T> {
        await this._waitUntilPoolReady();
        const promise = callback();
        this._pool.add(promise);
        try {
            return await promise;
        } finally {
            this._pool.delete(promise);
            this._emitter.emit("taskComplete");
        }
    }
}

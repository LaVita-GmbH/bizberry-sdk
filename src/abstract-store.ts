import autoBind from "auto-bind"

export type StoreOptionsType = {}
export type StoreValueOptionsType = {
    isPersistent?: boolean
}

export class AbstractStore {
    values: object
    constructor(values: StoreOptionsType = {}) {
        this.values = values
        autoBind(this)
    }

    async get(key: string): Promise<string> {
        return this.values[key]?.value
    }

    async set(key: string, value: string, options?: StoreValueOptionsType): Promise<void> {
        this.values[key] = {
            value,
            options,
        }
    }

    async del(key: string): Promise<void> {
        delete this.values[key]
    }
}

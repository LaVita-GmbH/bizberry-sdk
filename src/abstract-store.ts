import autoBind from "auto-bind"

export type StoreOptionsType = {}
export type StoreValueOptionsType = {
    isPersistent?: boolean
}
export type StoreValueType = {
    value: string,
    options?: StoreValueOptionsType,
}

export class AbstractStore {
    values: Record<string, StoreValueType>
    constructor(values: StoreOptionsType = {}) {
        this.values = values
        autoBind(this)
    }

    async get(key: string): Promise<string | null> {
        return this.values[key]?.value || null
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

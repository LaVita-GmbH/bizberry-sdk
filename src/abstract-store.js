import autoBind from "auto-bind"
export class AbstractStore {
    constructor() {
        this.values = {}
        autoBind(this)
    }

    /**
     * @param {string} key
     */
    async get(key) {
        return this.values[key]?.value
    }

    /**
     * Store a value on a specific key
     * @param {string} key
     * @param {string} value
     */
    async set(key, value, options) {
        this.values[key] = {
            value,
            options,
        }
    }

    /**
     * @param {string} key
     */
    async del(key) {
        delete this.values[key]
    }
}

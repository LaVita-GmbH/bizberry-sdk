export class AbstractStore {
    constructor() {
        this.values = {}
    }

    /**
     * @param {string} key
     */
    get = async key => {
        return this.values[key].value
    }

    /**
     * Store a value on a specific key
     * @param {string} key
     * @param {string} value
     */
    set = async (key, value, options) => {
        this.values[key] = {
            value,
            options,
        }
    }

    /**
     * @param {string} key
     */
    del = async key => {
        delete this.values[key]
    }
}

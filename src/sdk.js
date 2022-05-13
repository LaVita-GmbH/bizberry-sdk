import { API } from "./api"
import { Cache } from "./cache"
import { bindToClass } from "./utils/bind-to-class"

/**
 * Main SDK implementation provides the public API to interact with a remote instance.
 * @uses API
 * @uses Configuration
 */
export class SDK {
    static plugins = []

    // create a new instance with an API
    constructor(reAuth) {
        this.reAuth = reAuth
        this.cache = new Cache()
        this.api = new API(this.cache, reAuth)

        this.plugins.forEach(plugin => bindToClass(plugin, this))
    }

    static registerPlugin(plugin) {
        this.plugins.push(plugin)
    }
}

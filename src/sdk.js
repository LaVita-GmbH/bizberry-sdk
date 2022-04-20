import { API } from "./api"
import { Cache } from "./cache"
import { Configuration } from "./config"
import { Focus } from "./focus"
import { bindToClass } from "./utils/bind-to-class"

/**
 * Main SDK implementation provides the public API to interact with a remote instance.
 * @uses API
 * @uses Configuration
 */
export class SDK {
    static plugins = []

    // create a new instance with an API
    constructor(options, reAuth) {
        this.reAuth = reAuth
        this.config = new Configuration(options, options ? options.storage : undefined)
        this.cache = new Cache()
        this.api = new API(this.config, this.cache, reAuth)
        this.focus = new Focus(options)

        this.plugins.forEach(plugin => bindToClass(plugin, this))
    }

    static registerPlugin(plugin) {
        this.plugins.push(plugin)
    }
}

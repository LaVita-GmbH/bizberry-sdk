export class Cache {
    /**
     * Creates a new cache instance, will be used once for each instance (passing refs).
     * @constructor
     */
    constructor() {
        this.cache = {}
    }

    // HELPER METHODS ============================================================

    /**
     * Reset the cache
     */
    reset() {
        this.cache = {}
    }
}

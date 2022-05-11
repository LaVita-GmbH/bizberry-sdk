export class AbstractStore {
    async get(key) {
        throw error()
    }

    async set(key, value) {
        throw error()
    }

    async del(key) {
        throw error()
    }
}

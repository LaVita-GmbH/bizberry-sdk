import { SDK } from "../sdk"
import { getPayload } from "../utils/payload"

class Core {
    /**
     * Get the configuration of the sdk
     */
    info() {
        return this.config
    }

    /**
     * add EventListener for focus to refresh the tokens on focus
     */
    mount() {
        let hasBeenCalled = false
        this.unsubscribeFocus = this.focus.subscribe(async() => {
            if (this.focus.isFocused() && !hasBeenCalled) {
                hasBeenCalled = true
                try {
                    await this.refresh()
                    if (this.config.user_id) {
                        await this.getCustomerByUserId(this.config.user_id)
                    }
                } catch (error) {
                    return
                }
                hasBeenCalled = false
            }
        })
    }

    /**
     * remove EventListener for focus
     */
    unmount() {
        this.unsubscribeFocus && this.unsubscribeFocus()
    }

    /**
     * Login to the API
     * Gets a new token from the API and stores it in this.config
     */
    async login(credentials) {
        if (this.config.email && this.config.email !== credentials.email && this.config.userToken) {
            this.api.auth.logout()
        }
        const response = await this.api.auth.login(credentials)
        this.config.email = credentials.email
        const user = await this.getUser()
        await this.getCustomerByUserId(user.id)
        return response
    }

    /**
     * Logs the user out by "forgetting" the token, and clearing the refresh interval
     */
    async logout() {
        if (this.config.userToken) {
            const payload = getPayload(this.config.userToken)
            await this.deleteUserToken(this.config.user_id, payload.jti)
        }
        return this.api.auth.logout()
    }

    /**
     * Resets the client instance by logging out and deleting the persisted data
     */
    async reset() {
        this.api.reset()
        await this.api.auth.init()
    }

    /**
     * Initialize the client instance
     */
    async init() {
        await this.api.auth.init()
    }

    /**
     * Refresh the token if it is about to expire
     */
    async refreshIfNeeded() {
        return await this.api.auth.refreshIfNeeded()
    }

    /**
     * Force a refresh of the token to include critical data
     */
    async forceRefresh() {
        return await this.api.auth.forceRefresh()
    }

    /**
     * Force a refresh of the token to include critical data
     */
    async refresh() {
        return await this.api.auth.refresh()
    }

    validateToken(token, interval) {
        return this.api.auth.validateToken(token, interval)
    }

    /**
     * Get the country where the request ip belongs to
     */
    async geoCountry() {
        return await this.api.get("/geo/country")
    }
}

SDK.registerPlugin(Core)

import { getCookie, setCookie } from "./utils/cookies"

import { getPayload } from "./utils/payload"

const STORAGE_KEY = "bizberry-sdk-js"

export class Configuration {
    /**
     * Creates a new configuration instance, will be used once for each instance (passing refs).
     * @constructor
     * @param initialConfig           Initial configuration values
     * @param storage                 Storage adapter for persistence
     */
    constructor(initialConfig = {}, storage) {
        this.storage = storage

        let dehydratedConfig = {}
        if (storage && Boolean(initialConfig.persist)) {
            // dehydrate if storage was provided and persist flag is set
            dehydratedConfig = this.dehydratedInitialConfiguration(storage)
        }

        const persist = Boolean(initialConfig.persist)

        this.internalConfiguration = {
            ...initialConfig,
            ...dehydratedConfig,
            persist,
        }
    }

    // ACCESSORS =================================================================

    get accessToken() {
        return this.internalConfiguration.accessToken
    }

    set accessToken(token) {
        this.internalConfiguration.accessToken = token
    }

    get clientToken() {
        return this.internalConfiguration.clientToken
    }

    set clientToken(token) {
        this.partialUpdate({ clientToken: token })
    }

    get transactionClientToken() {
        return this.internalConfiguration.transactionClientToken
    }

    set transactionClientToken(token) {
        this.partialUpdate({ transactionClientToken: token })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get userToken() {
        return this.getCookieData("userToken", { validate: [{ key: "user_id", payloadKey: "sub" }] })
    }

    set userToken(token) {
        if (this.internalConfiguration.crossDomain) {
            setCookie(`${STORAGE_KEY}-userToken`, token, this.internalConfiguration.crossDomain)
        }
        this.partialUpdate({ userToken: token })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get transactionUserToken() {
        return this.internalConfiguration.transactionUserToken
    }

    set transactionUserToken(token) {
        this.partialUpdate({ transactionUserToken: token })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get url() {
        return this.internalConfiguration.url
    }

    set url(url) {
        this.internalConfiguration.url = url
    }

    get version() {
        return this.internalConfiguration.version
    }

    set version(version) {
        this.internalConfiguration.version = version
    }

    get tenant() {
        return this.internalConfiguration.tenant
    }

    set tenant(tenant) {
        this.internalConfiguration.tenant = tenant
    }

    get persist() {
        return this.internalConfiguration.persist
    }

    set persist(persist) {
        this.internalConfiguration.persist = persist
    }

    get auth() {
        return this.internalConfiguration.auth
    }

    set auth(auth) {
        this.internalConfiguration.auth = auth
    }

    get is_initialized() {
        return this.internalConfiguration.is_initialized
    }

    set is_initialized(value) {
        console.debug("is_initialized", value)
        this.internalConfiguration.is_initialized = value
        if (value) this._initialize_promise_resolve()
        else
            this._initialize_promise = new Promise((resolve, reject) => {
                this._initialize_promise_resolve = resolve
            })
    }

    // USER DATA =================================================================

    get user_id() {
        return this.internalConfiguration.user_id
    }

    set user_id(id) {
        this.partialUpdate({ user_id: id })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get client_id() {
        return this.internalConfiguration.client_id
    }

    set client_id(id) {
        this.partialUpdate({ client_id: id })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get email() {
        return this.internalConfiguration.email
    }

    set email(email) {
        this.partialUpdate({ email: email })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    // ACCESS_TOKENS DATA ========================================================

    get addresses() {
        return this.internalConfiguration.addresses
    }

    set addresses({ id, access_token }) {
        this.partialUpdate({ addresses: { ...this.internalConfiguration.addresses, [id]: access_token } })
    }

    get contacts() {
        return this.internalConfiguration.contacts
    }

    set contacts({ id, access_token }) {
        this.partialUpdate({ contacts: { ...this.internalConfiguration.contacts, [id]: access_token } })
    }

    get financeAccounts() {
        return this.internalConfiguration.financeAccounts
    }

    set financeAccounts({ id, access_token }) {
        this.partialUpdate({ financeAccounts: { ...this.internalConfiguration.financeAccounts, [id]: access_token } })
    }

    // CART DATA =================================================================

    get currency() {
        return this.internalConfiguration.currency
    }

    set currency(currency) {
        this.internalConfiguration.currency = currency
    }

    get pricelist_id() {
        return this.internalConfiguration.pricelist_id
    }

    set pricelist_id(id) {
        this.partialUpdate({ pricelist_id: id })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get cart_id() {
        return this.getCookieData("cart_id")
    }

    set cart_id(id) {
        if (this.internalConfiguration.crossDomain) {
            setCookie(`${STORAGE_KEY}-cart_id`, id, this.internalConfiguration.crossDomain)
        }
        this.partialUpdate({ cart_id: id })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get cart_access_token() {
        return this.getCookieData("cart_access_token")
    }

    set cart_access_token(token) {
        if (this.internalConfiguration.crossDomain) {
            setCookie(`${STORAGE_KEY}-cart_access_token`, token, this.internalConfiguration.crossDomain)
        }
        this.partialUpdate({ cart_access_token: token })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get historic_cart_id() {
        return this.internalConfiguration.historic_cart_id
    }

    set historic_cart_id(id) {
        this.partialUpdate({ historic_cart_id: id })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    get historic_cart_access_token() {
        return this.internalConfiguration.historic_cart_access_token
    }

    set historic_cart_access_token(token) {
        this.partialUpdate({ historic_cart_access_token: token })
        window.dispatchEvent(new CustomEvent("bizberry_sdk_config_update"))
    }

    // HELPER METHODS ============================================================

    /**
     * Update the configuration values, will also hydrate them if persistance activated
     * @param {object} config
     */
    update(config) {
        this.internalConfiguration = config

        this.hydrate(config)
    }

    /**
     * Update partials of the configuration, behaves like the [update] method
     * @param {object} config
     */
    partialUpdate(config) {
        this.internalConfiguration = {
            ...this.internalConfiguration,
            ...config,
        }

        this.hydrate(this.internalConfiguration)
    }

    /**
     * Get Data from cookie if cookie data is different from internalConfiguration then update internalConfiguration
     * @param {string} key
     */
    getCookieData(key, options) {
        if (!this.internalConfiguration.crossDomain) return this.internalConfiguration[key]

        const cookieData = getCookie(`${STORAGE_KEY}-${key}`)
        if (cookieData !== this.internalConfiguration[key]) {
            if (options?.validate) {
                const payload = getPayload(cookieData)
                options.validate.forEach(item => {
                    if (this.internalConfiguration[item.key] !== payload[item.payloadKey] || !cookieData) {
                        this[item.key] = payload[item.payloadKey]
                        this.email = undefined
                        this.client_id = undefined
                        this.pricelist_id = undefined
                        this.transactionUserToken = undefined
                    }
                })
            }

            this.partialUpdate({ [key]: cookieData })
            return cookieData
        }
        return this.internalConfiguration[key]
    }

    /**
     * Reset the whole confiugration and remove hydrated values from storage as well
     */
    reset() {
        delete this.internalConfiguration.clientToken
        delete this.internalConfiguration.transactionClientToken
        delete this.internalConfiguration.userToken
        delete this.internalConfiguration.transactionUserToken
        delete this.internalConfiguration.email
        delete this.internalConfiguration.user_id
        delete this.internalConfiguration.client_id
        delete this.internalConfiguration.pricelist_id
        delete this.internalConfiguration.cart_id
        delete this.internalConfiguration.cart_access_token
        delete this.internalConfiguration.historic_cart_id
        delete this.internalConfiguration.historic_cart_access_token
        delete this.internalConfiguration.addresses
        delete this.internalConfiguration.contacts
        delete this.internalConfiguration.financeAccounts

        this.deleteHydratedConfig()
    }

    // STORAGE METHODS ===========================================================

    dehydrate() {
        if (!this.storage || !this.persist) {
            return
        }

        const nativeValue = this.storage.getItem(STORAGE_KEY)

        if (!nativeValue) {
            return
        }

        const parsedConfig = JSON.parse(nativeValue)
        this.internalConfiguration = parsedConfig

        return parsedConfig
    }

    hydrate(props) {
        // Clears the passed storage to avoid passing itself and going out of memory
        props.storage = undefined
        if (!this.storage || !this.persist) {
            return
        }

        // dont save initial configuration and undefined in storage
        let clone = { ...props }
        delete clone.url
        delete clone.version
        delete clone.tenant
        delete clone.persist
        delete clone.auth
        delete clone.accessToken
        delete clone.currency
        delete clone.crossDomain
        delete clone.refetchOnWindowFocus

        this.storage.setItem(STORAGE_KEY, JSON.stringify(clone))
    }

    deleteHydratedConfig() {
        if (!this.storage || !this.persist) {
            return
        }

        this.storage.removeItem(STORAGE_KEY)
    }

    dehydratedInitialConfiguration = storage => {
        if (!storage) {
            return {}
        }

        const nativeValue = storage.getItem(STORAGE_KEY)

        if (!nativeValue) {
            return {}
        }

        try {
            return JSON.parse(nativeValue)
        } catch (err) {
            return {}
        }
    }

    awaitInit = async () => {
        if (this.is_initialized) return
        
        console.debug("Awaiting INIT", this._initialize_promise)
        return await this._initialize_promise
    }
}

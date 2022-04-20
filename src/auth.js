import { getPayload } from "./utils/payload"

export class Authentication {
    constructor(config, api) {
        this.config = config
        this.api = api

        this.init()
    }

    async init() {
        const { auth, clientToken, userToken, accessToken } = this.config
        this.config.is_initialized = false

        const clientTokenValid = this.validateToken(clientToken, 86400000)
        const userTokenValid = this.validateToken(userToken, 86400000)

        if (!userTokenValid && userToken) {
            this.logout()
        }

        if (clientTokenValid || accessToken) {
            try {
                await this.refresh()
            } catch (error) {
                this.config.is_initialized = true
                return
            }
            this.startInterval()
        } else {
            this.login(
                {
                    email: auth.email,
                    password: auth.password,
                },
                true
            )
        }

        if (userToken) {
            try {
                const payload = getPayload(userToken)
                const customers = await this.api.get("/customer/clients", ({ user__id: payload.sub }))
                this.config.client_id = customers.clients[0]?.id
                if (customers.clients[0]?.pricelist?.id) {
                    this.config.pricelist_id = customers.clients[0]?.pricelist?.id
                }
            } catch (error) {
                console.debug("Error occurred while loading customer", error)
            }
        } else {
            try {
                const pricelists = await this.api.get("/catalogue/pricelists", { is_default: true })
                this.config.pricelist_id = pricelists.pricelists[0].id
            } catch (error) {
                console.debug("Error occurred while loading default pricelist", error)
            }
        }
        this.config.is_initialized = true
    }

    /**
     * check if there is a token and if it is longer than the interval valid
     * @param {string} token
     * @param {number} [interval]
     * @returns {boolean} true if valid
     */
    validateToken(token, interval = 30000) {
        if (!token) {
            return false
        }

        const payload = getPayload(token)

        if (!payload || !payload.exp) {
            return false
        }

        const timeDiff = payload.exp - Date.now()

        if (timeDiff < interval) {
            return false
        }

        return true
    }

    /**
     * Login to the API; Gets a new token from the API, stores it in this.config and start the auto refresh interval
     * @param {object} credentials     User login credentials
     * @param {boolean=false} client   Login for client or not
     * @return {Promise}
     */
    async login(credentials, client = false) {
        let body = {
            email: credentials.email,
            password: credentials.password,
            tenant: {
                id: this.config.tenant,
            },
        }

        if (credentials.otp) {
            body.otp = credentials.otp
        }

        const userToken = await this.api.post("/access/auth/user", body)

        // save new token in configuration
        if (client) {
            this.config.clientToken = userToken.token.user
        } else {
            this.config.userToken = userToken.token.user
        }

        const transactionToken = await this.forceRefresh()
        // use interval for login refresh
        this.startInterval()

        return { token: { user: userToken.token.user, transaction: transactionToken.token.transaction } }
    }

    /**
     * Logs the user out by "forgetting" the user tokens
     */
    logout() {
        this.config.userToken = undefined
        this.config.transactionUserToken = undefined
        this.config.email = undefined
        this.config.user_id = undefined
        this.config.client_id = undefined
        this.config.pricelist_id = undefined
        this.config.cart_id = undefined
        this.config.cart_access_token = undefined

        return
    }

    /// REFRESH METHODS ----------------------------------------------------------

    /**
     * Refresh the token if it is about to expire (within 30 seconds of expiry date)
     */
    async refreshIfNeeded() {
        const { transactionClientToken, userToken, transactionUserToken } = this.config

        let transactionToken = transactionClientToken

        if (userToken) {
            transactionToken = transactionUserToken
        }

        if (!this.validateToken(transactionToken)) {
            try {
                return await this.refresh()
            } catch (error) {
                return
            }
        }

        return
    }

    /**
     * Force a refresh of the token, to include critical data
     */
    async forceRefresh() {
        return await this.refresh(true)
    }

    /**
     * Request a new transaction token.
     * @param {boolean = false} includeCritical
     */
    async refresh(includeCritical = false) {
        const { transactionClientToken, userToken, transactionUserToken } = this.config
        const body = {
            include_critical: includeCritical,
            access_token: this.config.userToken || this.config.clientToken ? undefined : this.config.accessToken,
        }
        const response = await this.api.request(
            "POST",
            "/access/auth/transaction",
            null,
            body,
            this.config.userToken || this.config.clientToken
                ? {
                        Authorization: this.config.userToken || this.config.clientToken,
                    }
                : null,
            includeCritical ? 1 : 0
        )

        if (response?.token) {
            if (!userToken) {
                this.config.transactionClientToken = response.token.transaction || transactionClientToken
            } else {
                this.config.transactionUserToken = response.token.transaction || transactionUserToken
            }
        }

        return response
    }

    /**
     * Starts an interval of 20 seconds that will check if the token needs refreshing
     */
    startInterval() {
        this.refreshInterval = setInterval(this.refreshIfNeeded.bind(this), 20000)
    }

    /**
     * Clears and nullifies the token refreshing interval
     */
    stopInterval() {
        clearInterval(this.refreshInterval)
        this.refreshInterval = undefined
    }
}

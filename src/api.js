import { AbstractStore } from "./abstract-store"
import { getPayload } from "./utils/payload"
import { querify } from "./utils/params"

export class APIError extends Error {
    constructor(message, info) {
        super(message) // 'Error' breaks prototype chain here
        this.message = message
        this.info = info
        Object.setPrototypeOf(this, new.target.prototype) // restore prototype chain
    }

    get url() {
        return this.info.url
    }

    get method() {
        return this.info.method.toUpperCase()
    }

    get params() {
        return this.info.params || {}
    }

    get status() {
        return this.info.status
    }

    get code() {
        return `${this.info.code || -1}`
    }

    get type() {
        return this.info.type
    }

    get msg() {
        return this.info.msg
    }

    get event_id() {
        return this.info.event_id
    }

    get detail() {
        return this.info.detail
    }

    get details() {
        return this.info.details
    }

    get loc() {
        return this.info.loc
    }

    toString() {
        return [
            "bizberry-API call failed:",
            `${this.method} ${this.url} ${JSON.stringify(this.params)} -`,
            this.status,
            this.message,
            `(code ${this.code})`,
        ].join(" ")
    }
}

export class API {
    static current

    static init(options) {
        if (API.current) return
        API.current = new API(options)
    }

    /**
     * @param options
     * @param {AbstractStore} options.store
     * @param {string} options.url
     * @param {string} options.tenant
     */
    constructor({ store, url, tenant }) {
        /** @type { AbstractStore } */
        this.store = store
        this.url = url
        this.tenant = tenant
    }

    login = async values => {
        values.tenant = { id: this.tenant }

        console.log("login", values)

        const data = await this.post("/access/auth/user", values)
        console.log("login data", data)
        this.store.set("token_user", data.token.user, { isPersistent: true })

        await this.getTransactionToken()
    }

    logout = async () => {
        this.store.del("token_user")
        this.store.del("token_transaction")
    }

    getTransactionToken = async (includeCritical = false) => {
        const body = {
            include_critical: includeCritical,
        }

        const data = await this.post("/access/auth/transaction", body, undefined, {
            Authorization: this.store.get("token_user"),
        })

        this.store.set("token_transaction", data.token.transaction)

        /**Should token be validated? */
        const validToken = this.validateToken(this.store.set("token_transaction", data.token.transaction))

        if (!validToken) {
            this.logout()
        }
    }

    refreshIfNeeded = async () => {
        const { tokenTransaction } = this.store.get("token_transaction")

        if (!tokenTransaction) {
            try {
                return await this.getTransactionToken()
            } catch (error) {
                return
            }
        }

        return
    }

    /**
     * Validate token function
     * @param {string} token
     * @param {number} interval
     */
    validateToken = async (token, interval = 30000) => {
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
     * GET convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    get = async (endpoint, params) => {
        return await this.request("GET", endpoint, params)
    }

    /**
     * POST convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    post = async (endpoint, body, params, headers) => {
        return await this.request("POST", endpoint, params, body, headers)
    }

    /**
     * PATCH convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    patch = async (endpoint, body, params) => {
        return await this.request("PATCH", endpoint, params, body)
    }

    /**
     * PUT convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    put = async (endpoint, body, params) => {
        return await this.request("PUT", endpoint, params, body)
    }

    /**
     * DELETE convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    delete = async (endpoint, params) => {
        return await this.request("DELETE", endpoint, params)
    }

    /**
     * Perform an API request to the Bizberry API
     * @param {string} method                   Selected HTTP method
     * @param {string} endpoint                 Endpoint definition as path
     * @param {object={}} params                Query parameters
     * @param {object=null} data                Data passed to api
     * @param {object={}} headers               Optional headers to include
     * @return {Promise}
     */
    request = async (method, endpoint, params, data = null, headers = {}, retry = 1) => {
        if (!this.url) {
            throw new Error("SDK has no URL configured to send requests to.")
        }

        const query = params && Object.keys(params).length ? "?" + querify(params) : ""

        if (headers !== null && !headers?.["Authorization"]) {
            console.log("inside headers not null")
            // headers["Authorization"] = this.store.get("token_transaction")
        }

        try {
            const response = await fetch(this.url + endpoint + query, {
                method: method,
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                    ...headers,
                },
                mode: "cors",
                credentials: "include",
                body: data ? JSON.stringify(data) : undefined,
            })

            let responseData
            const contentType = response.headers.get("content-type")
            if (response.status !== 204 && contentType && contentType.indexOf("application/json") !== -1) {
                responseData = await response.json()
            } else if (response.status !== 204 && response.ok) {
                responseData = await response.blob()
                return URL.createObjectURL(responseData)
            }

            if (!responseData) responseData = {}

            if (response.ok || response.status === 402) {
                return responseData
            }

            if (
                response.status === 403 &&
                ["JWTClaimsError", "FieldAccessError"].includes(responseData.detail.type) &&
                ["required_audience_missing", "access_error.field_is_critical"].includes(responseData.detail.code)
            ) {
                if (retry > 0) {
                    await this.auth.forceRefresh()
                    return await this.request(method, endpoint, params, data, {}, retry - 1)
                }
            } else if (response.status === 401 && responseData.detail.type === "AuthError") {
                switch (responseData.detail.code) {
                    case "token_too_old_for_include_critical":
                        if (retry > 0) {
                            await this.reAuth()
                            return await this.request(method, endpoint, params, data, {}, retry - 1)
                        } else if (retry === 0) {
                            return await this.auth.refresh()
                        }
                        break
                    case "invalid_user_token":
                        await this.reAuth()
                        return
                    default:
                        this.auth.logout()
                        await this.auth.refresh()
                        break
                }
            } else if (response.status === 401 && responseData.detail.type === "ExpiredSignatureError" && retry > 0) {
                await this.auth.refresh()
                return await this.request(method, endpoint, params, data, {}, retry - 1)
            } else if (response.status === 401 && responseData.detail.type === "JWTError") {
                this.auth.logout()
                await this.auth.refresh()
                return
            }

            const error = {
                response: response,
                data: responseData,
            }
            throw error
        } catch (error) {
            const errorResponse = error && (error.response || {})
            const errorResponseData = error && (error.data || {})
            const detail = Array.isArray(errorResponseData.detail)
                ? errorResponseData.detail[0]
                : errorResponseData.detail
            const baseErrorInfo = {
                error,
                url: endpoint,
                method: method,
                params: params,
                status: errorResponse.status,
                code: detail?.code,
                type: detail?.type,
                msg: detail?.message || detail?.msg,
                event_id: errorResponseData.event_id,
                detail: detail?.detail,
                loc: detail?.loc,
            }

            if (Array.isArray(errorResponseData.detail)) {
                baseErrorInfo.details = errorResponseData.detail
            }

            if (error && error.response && error.data) {
                throw new APIError(detail?.type || "Unknown error occured", baseErrorInfo)
            } else {
                if (retry > 0) {
                    return await this.request(method, endpoint, params, data, {}, retry - 1)
                }
                throw new APIError("Network error", {
                    ...baseErrorInfo,
                    status: -1,
                })
            }
        }
    }
}

import { Authentication } from "./auth"
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
    constructor(config, cache, reAuth) {
        this.config = config
        this.cache = cache
        this.reAuth = reAuth
        this.auth = new Authentication(config, {
            post: this.post.bind(this),
            get: this.get.bind(this),
            request: this.request.bind(this),
        })
        this.request = this.request.bind(this)
    }

    /**
     * Resets the client instance by logging out and removing the URL and project
     */
    reset() {
        this.auth.logout()
        this.auth.stopInterval()
        this.config.reset()
        this.cache.reset()
    }

    loadData(relation, id, params, level, maxLevel) {
        let relation_location = relation.split("/")
        if (relation_location[0] === "bizberry") {
            relation_location[0] = ""
            const endpoint = `${relation_location.join("/")}/${id}`
            const query = params && Object.keys(params).length ? "?" + querify(params) : ""
            const cache_key = endpoint + query
            if (!this.cache.cache[cache_key]) {
                this.cache.cache[cache_key] = {
                    request: (async () => {
                        try {
                            return await this.request("GET", endpoint, params, undefined, undefined, undefined, level + 1, maxLevel)
                        } catch (error) {
                            console.error("Error while loadData", relation, id, params, error)
                            delete this.cache.cache[cache_key]
                            throw error
                        }
                    })(),
                    created_at: new Date(),
                }
            }
            return this.cache.cache[cache_key]
        } else {
            throw Error(`Cannot load data for $rel=${relation}`)
        }
    }

    async _enrichObject(values, key, originParams, level, maxLevel) {
        if (key === "_parent") return
        if (key === "$rel") {
            const replace = (_, path) =>
                path
                    .split(".")
                    .slice(1)
                    .reduce((a, b) => a[b], values)
            const regex = new RegExp("{([^}]+)}")
            try {
                values.$rel = values.$rel.replace(regex, replace)
            } catch (error) {
                console.debug(error)
                return
            }

            // TODO hook for plugins

            if (values.access_token) {
                values.$rel_params = { ...values.$rel_params, access_token: values.access_token }
            }
            const data = this.loadData(values.$rel, values.id, values.$rel_params, level, maxLevel)
            if (data) {
                const { request, created_at, updated_at } = data
                try {
                    const response = await request
                    Object.assign(values, response, {
                        $rel_created_at: created_at,
                        $rel_updated_at: updated_at,
                    })
                } catch (error) {
                    console.error("failed to receive response", error)
                }
            }
        } else {
            await this.enrichData(values[key], values, originParams, level + 1, maxLevel)
        }
        if (values._parent) delete values._parent
    }

    async enrichData(values, parent, originParams, level, maxLevel) {
        if (level >= maxLevel) {
            console.debug("Stop enrichData because of too high level of recursion")
            return
        }

        // with typeof arrays are objects aswell
        if (typeof values !== "object" || values === null) return

        if (Array.isArray(parent)) {
            values._parent = parent._parent
        } else if (parent !== undefined) {
            values._parent = parent
        }
        const enrichObjects = Object.keys(values).map(key => this._enrichObject(values, key, originParams, level, maxLevel))
        await Promise.allSettled(enrichObjects)
    }

    updateCache(endpoint, query, data) {
        const cache_key = endpoint + query
        if (!this.cache.cache[cache_key]) return
        this.cache.cache[cache_key] = { ...this.cache.cache[cache_key], request: data, updated_at: new Date() }
    }

    /**
     * GET convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    async get(endpoint, params) {
        return await this.request("GET", endpoint, params)
    }

    /**
     * POST convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    async post(endpoint, body, params) {
        return await this.request("POST", endpoint, params, body)
    }

    /**
     * PATCH convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    async patch(endpoint, body, params) {
        return await this.request("PATCH", endpoint, params, body)
    }

    /**
     * PUT convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} body          Data passed to api
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    async put(endpoint, body, params) {
        return await this.request("PUT", endpoint, params, body)
    }

    /**
     * DELETE convenience method. Calls the request method for you
     * @param {string} endpoint      Endpoint definition as path
     * @param {object} params        Query parameters
     * @return {Promise}
     */
    async delete(endpoint, params) {
        return await this.request("DELETE", endpoint, params)
    }

    /**
     * Perform an API request to the Olypm API
     * @param {string} method                   Selected HTTP method
     * @param {string} endpoint                 Endpoint definition as path
     * @param {object={}} params                Query parameters
     * @param {object=null} data                Data passed to api
     * @param {object={}} headers               Optional headers to include
     * @return {Promise}
     */
    async request(method, endpoint, params, data = null, headers = {}, retry = 1, level = 0, maxLevel = 19) {
        if (!this.config.url) {
            throw new Error("SDK has no URL configured to send requests to.")
        }

        let baseURL = `${this.config.url}${this.config.version}`

        const query = params && Object.keys(params).length ? "?" + querify(params) : ""

        if (headers !== null && !headers?.["Authorization"]) {
            if (this.config.userToken) {
                if (this.config.transactionUserToken) {
                    headers["Authorization"] = this.config.transactionUserToken
                } else {
                    headers["Authorization"] = this.config.userToken
                }
            } else if (this.config.clientToken || this.config.transactionClientToken) {
                if (this.config.transactionClientToken) {
                    headers["Authorization"] = this.config.transactionClientToken
                } else {
                    headers["Authorization"] = this.config.clientToken
                }
            }
        }

        try {
            const response = await fetch(baseURL + endpoint + query, {
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
                this.updateCache(endpoint, query, responseData)
                await this.enrichData(responseData, undefined, params, level, maxLevel)
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

            if (detail?.detail) {
                await this.enrichData(detail.detail, undefined, params)
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

import { AbstractStore } from "./abstract-store"
import autoBind from "auto-bind"
import { getPayload } from "./utils/payload"
import { querify } from "./utils/params"

type InfoType = {
    url: string
    method: string
    params: object
    status: number
    code: number
    type: string
    msg: string
    event_id?: string
    detail?: string
    details?: any
    loc?: string
}

export class APIError extends Error {
    message: string
    info: InfoType

    constructor(message?: string, info?: InfoType) {
        super(message)
        this.message = message
        this.info = info
        Object.setPrototypeOf(this, new.target.prototype)
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

type APIOptions = {
    store: AbstractStore
    url: string
    tenant: string
}

export class API {
    store: AbstractStore
    url: string
    tenant: string

    static current: API

    static init(options: APIOptions) {
        if (API.current) return
        API.current = new API(options)
    }

    constructor({ store, url, tenant }: APIOptions) {
        this.store = store
        this.url = url
        this.tenant = tenant
        autoBind(this)
    }

    async login(values) {
        values.tenant = { id: this.tenant }
        const data = await this.post("/access/auth/user", values, undefined, undefined, false)

        await this.store.set("token_user", data.token.user, { isPersistent: true })
        await this.getTransactionToken()
    }

    async logout() {
        await this.store.del("token_user")
        await this.store.del("token_transaction")
    }

    async getTransactionToken(includeCritical: boolean = false) {
        const body = {
            include_critical: includeCritical,
        }
        const userToken = await this.store.get("token_user")
        if(!userToken)
            throw new APIError("User Token not set")

        const data = await this.post("/access/auth/transaction", body, undefined, {
            Authorization: userToken,
        })

        await this.store.set("token_transaction", data.token.transaction)

        const validToken = await this.validateToken(data.token.transaction)

        if (!validToken) {
            return this.logout()
        }

        return data.token.transaction
    }

    async refreshIfNeeded() {
        const tokenTransaction = await this.store.get("token_transaction")

        if (!tokenTransaction) {
            try {
                return await this.getTransactionToken()
            } catch (error) {
                return
            }
        }

        return
    }

    async validateToken(token: string, interval: number = 30000): Promise<boolean> {
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

    async get(endpoint: string, params?: object) {
        return await this.request("GET", endpoint, params)
    }

    async post(endpoint: string, body: object, params?: object, headers?: object, is_authorized_endpoint: boolean = true) {
        return await this.request("POST", endpoint, params, body, headers, undefined, is_authorized_endpoint)
    }

    async patch(endpoint: string, body: object, params?: object) {
        return await this.request("PATCH", endpoint, params, body)
    }

    async put(endpoint: string, body: object, params?: object) {
        return await this.request("PUT", endpoint, params, body)
    }

    async delete(endpoint: string, params?: object) {
        return await this.request("DELETE", endpoint, params)
    }

    async request(method: string, endpoint: string, params?: object, data: object = null, headers: object = {}, retry: number = 1, is_authorized_endpoint: boolean = true) {
        if (!this.url) {
            throw new Error("SDK has no URL configured to send requests to.")
        }

        const query = params && Object.keys(params).length ? "?" + querify(params) : ""

        if (is_authorized_endpoint && headers !== null && !headers?.["Authorization"]) {
            try {
                headers["Authorization"] = await this.store.get("token_transaction") || await this.getTransactionToken()
            } catch (error) {
                console.error(error)
                throw error
            }
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
                    await this.getTransactionToken(true)
                    return await this.request(method, endpoint, params, data, {}, retry - 1)
                }
            } else if (response.status === 401 && responseData.detail.type === "AuthError") {
                switch (responseData.detail.code) {
                    case "token_too_old_for_include_critical":
                        if (retry > 0) {
                            await this.getTransactionToken()
                            return await this.request(method, endpoint, params, data, {}, retry - 1)
                        } else if (retry === 0) {
                            return await this.getTransactionToken()
                        }
                        break
                    case "invalid_user_token":
                        await this.getTransactionToken()
                        return
                    default:
                        this.logout()
                        await this.getTransactionToken()
                        break
                }
            } else if (response.status === 401 && responseData.detail.type === "ExpiredSignatureError" && retry > 0) {
                await this.getTransactionToken()
                return await this.request(method, endpoint, params, data, {}, retry - 1)
            } else if (response.status === 401 && responseData.detail.type === "JWTError") {
                this.logout()
                await this.getTransactionToken()
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
                details: null,
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

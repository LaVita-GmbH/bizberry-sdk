import { AbstractStore } from "./abstract-store"
import autoBind from "auto-bind"
import { getPayload } from "./utils/payload"
import { querify } from "./utils/params"

type InfoType = {
    url: string
    method: string
    params?: object
    status: number
    code: number
    type: string
    msg: string
    event_id?: string
    detail?: string
    details?: any
    loc?: string
}

export class BaseError extends Error {}

export class APIError extends BaseError {
    message: string
    info?: InfoType

    constructor(message?: string, info?: InfoType) {
        super(message)
        this.message = message || ""
        this.info = info
        Object.setPrototypeOf(this, new.target.prototype)
    }

    get url() {
        return this.info?.url
    }

    get method() {
        return this.info?.method.toUpperCase()
    }

    get params() {
        return this.info?.params || {}
    }

    get status() {
        return this.info?.status
    }

    get code() {
        return `${this.info?.code || -1}`
    }

    get type() {
        return this.info?.type
    }

    get msg() {
        return this.info?.msg
    }

    get event_id() {
        return this.info?.event_id
    }

    get detail() {
        return this.info?.detail
    }

    get details() {
        return this.info?.details
    }

    get loc() {
        return this.info?.loc
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

export class RequestError extends BaseError {
    response: Response
    data?: any

    constructor(response?: any, data?: any) {
        super()
        this.response = response
        this.data = data
        Object.setPrototypeOf(this, new.target.prototype)
    }
}

type APIOptions = {
    store: AbstractStore
    url: string
    tenant: string
}

export type LoginValuesType = {
    login?: string
    id?: string
    password?: string,
    otp?: object,
}

type TokenPayloadType = {
    exp: number,
}

type AddHookOptions = {
    override?: boolean
}

type RequestOptions = {
    method: string
    endpoint: string
    params?: object
    data?: object
    headers?: Record<string, unknown>
    retry?: number
    is_authorized_endpoint?: boolean
    source?: string
    id?: string
}

export class API {
    store: AbstractStore
    url: string
    tenant: string
    hooks: {[key: string]: ((...args: any[]) => any)[]}

    static current: API

    static init(options: APIOptions) {
        if (API.current) return
        API.current = new API(options)
    }

    constructor({ store, url, tenant }: APIOptions) {
        this.store = store
        this.url = url
        this.tenant = tenant
        this.hooks = {}
        autoBind(this)
    }

    addHook(name: string, callback: (...args: any[]) => any, options: AddHookOptions = {}) {
        if (!(name in this.hooks) || options?.override)
            this.hooks[name] = []

        this.hooks[name].push(callback)
    }

    delHook(name: string, callback: (...args: any[]) => any) {
        this.hooks[name].splice(this.hooks[name].findIndex(callback), 1)
    }

    callHook(name: string, ...args: any[]) {
        return this.hooks[name].map(fn => fn(...args))
    }

    async userPasswordInput(includeCritical: boolean = false) {
        console.debug("Request password from user")
        await this.store.del("token_transaction")
        var password: string
        try {
            password = await this.callHook("user_password_input")[0]
        } catch (error) {
            console.error(error)
            throw new APIError("Failed to obtain password")
        }
        const token_user = await this.store.get("token_user")
        if (!token_user)
            throw new APIError("Cannot reauthenticate")

        const id = getPayload(token_user).sub
        await this.login({id, password}, includeCritical, false)
    }

    async login(values: LoginValuesType, includeCritical: boolean = false, getTransactionToken: boolean = true) {
        await this.store.del("token_transaction")
        const data = await this.post("/access/auth/user", {tenant: { id: this.tenant }, ...values}, undefined, undefined, false)

        await this.store.set("token_user", data.token.user, { isPersistent: true })
        if(getTransactionToken)
        await this.getTransactionToken(includeCritical)
    }

    async logout() {
        await this.store.del("token_user")
        await this.store.del("token_transaction")
    }

    async getTransactionToken(includeCritical: boolean = false): Promise<string | undefined> {
        console.debug("getTransactionToken", includeCritical)
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
            await this.logout()
            return
        }

        return data.token.transaction
    }

    async validateToken(token: string, interval: number = 30000): Promise<boolean> {
        if (!token) {
            return false
        }

        const payload = getPayload(token) as TokenPayloadType

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
        return await this.request({method: "GET", endpoint, params})
    }

    async post(endpoint: string, data: object, params?: object, headers?: Record<string, unknown>, is_authorized_endpoint: boolean = true) {
        return await this.request({method: "POST", endpoint, params, data, headers, is_authorized_endpoint})
    }

    async patch(endpoint: string, data: object, params?: object) {
        return await this.request({method: "PATCH", endpoint, params, data})
    }

    async put(endpoint: string, data: object, params?: object) {
        return await this.request({method: "PUT", endpoint, params, data})
    }

    async delete(endpoint: string, params?: object) {
        return await this.request({method: "DELETE", endpoint, params})
    }

    async request({method, endpoint, params, data, headers, retry, is_authorized_endpoint, source, id}: RequestOptions): Promise<any> {
        if (!this.url) {
            throw new Error("SDK has no URL configured to send requests to.")
        }

        if (headers === undefined)
            headers = {}

        if (is_authorized_endpoint === undefined)
            is_authorized_endpoint = true

        if (id === undefined)
            id = `${Math.random()}`

        if (retry === undefined)
            retry = 0

        if (retry) {
            console.warn("Retrying request", source)
        }

        console.debug("request", method, endpoint, params, headers, retry, is_authorized_endpoint, source, id)

        const query = params && Object.keys(params).length ? "?" + querify(params) : ""

        if (is_authorized_endpoint && headers !== null && !headers?.["Authorization"]) {
            try {
                console.debug("request using token_transaction")
                headers["Authorization"] = await this.store.get("token_transaction")
                if(!headers["Authorization"]) {
                    console.debug("transaction token not in store, get a new one")
                    headers["Authorization"] = await this.getTransactionToken()
                }
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

            console.debug("response", method, endpoint, responseData, id)

            if (!responseData) responseData = {}

            if (response.ok || response.status === 402) {
                return responseData
            }

            if (
                response.status === 403 &&
                ["JWTClaimsError", "FieldAccessError"].includes(responseData.detail.type) &&
                ["required_audience_missing", "access_error.field_is_critical"].includes(responseData.detail.code)
            ) {
                if (retry < 1) {
                    console.debug("retry request due to 403", method, endpoint, headers)
                    await this.getTransactionToken(true)
                    return await this.request({method, endpoint, params, data, retry: retry + 1, is_authorized_endpoint, source: "403", id})
                }
            } else if (response.status === 401 && responseData.detail.type === "ExpiredSignatureError" && retry < 1) {
                console.debug("retry request due to ExpiredSignatureError", method, endpoint, headers)
                await this.getTransactionToken()
                return await this.request({method, endpoint, params, data, retry: retry + 1, is_authorized_endpoint, source: "ExpiredSignatureError", id})
            } else if (response.status === 401 && responseData.detail.type === "JWTError") {
                console.debug("logout due to JWTError", method, endpoint, headers)
                this.logout()
                await this.getTransactionToken()
                return
            } else if (response.status === 401 && responseData.detail.type === "AuthError" && responseData.detail.code === "token_too_old_for_include_critical") {
                console.debug("retry request due to AuthError", method, endpoint, headers)
                await this.userPasswordInput(true)
                return await this.request({method, endpoint, params, data: {include_critical: true}, headers: {Authorization: await this.store.get("token_user")}, retry: retry + 1, is_authorized_endpoint, source: "AuthError", id})
            }

            throw new RequestError(response, responseData)
        } catch (error) {
            console.error("Error occurred while request", error)
            if(!(error instanceof BaseError)) {
                console.error("suppress error", error)
                return
            }

            if (error instanceof RequestError) {
                const errorResponse = error && (error.response || {})
                const errorResponseData = error && (error.data || {})
                const detail = Array.isArray(errorResponseData.detail)
                    ? errorResponseData.detail[0]
                    : errorResponseData.detail
                const baseErrorInfo: InfoType = {
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
                    if (retry < 1) {
                        console.warn("Retry request", method, endpoint, params, headers, retry)
                        return await this.request({method, endpoint, params, data, headers, retry: retry + 1, is_authorized_endpoint, source: "APIError", id})
                    }
                    throw new APIError("Network error", {
                        ...baseErrorInfo,
                        status: -1,
                    })
                }
            }

            throw error
        }
    }
}

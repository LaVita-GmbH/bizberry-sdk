import { SDK } from "../sdk"

class Access {
    /**
     * Create one time password
     * @param {object} body
     */
    async oneTimePassword(body) {
        return await this.api.post("/access/auth/otp", body)
    }

    /**
     * Check if contact exists and if email is valid
     * @param {object} body
     */
    async createUserCheck(body) {
        return await this.api.post("/access/auth/check", body)
    }

    /**
     * Create a new user with email and password
     * @param {object} body
     */
    async createUser(body) {
        const user = await this.api.post("/access/users", body)
        this.config.user_id = user.id
        const clone = { ...body }
        delete clone.language
        await this.login(clone)
        return user
    }

    /**
     * Get a user by user_id, if no user_id is set, then get your user
     * @param {string} [user_id]
     */
    async getUser(user_id = "self") {
        if (!this.config.transactionUserToken) return null
        const user = await this.api.get(`/access/users/${user_id}`)
        this.config.user_id = user.id
        return user
    }

    async updateUser(user_id, body) {
        return await this.api.patch(`/access/users/${user_id}`, body)
    }

    /**
     * Register a new user, log him in and add an address
     * @param {object} body
     */
    async register(body) {
        const user = await this.createUser({ email: body.email, password: body.password, language: body.language })
        const clone = { ...body }
        delete clone.email
        delete clone.password
        delete clone.language
        return await this.createAddress({
            ...clone,
            user: { id: user.id },
            type: { is_billing: true, is_shipping: true },
            is_primary: true,
        })
    }

    /**
     * Delete a userToken, important for crossDomain logout
     * @param {string} user_id
     * @param {string} token_id
     */
    async deleteUserToken(user_id, token_id) {
        return await this.api.delete(`/access/users/${user_id}/tokens/${token_id}`)
    }

    /**
     * Get tenant by tenant_id
     * @param {string} tenant_id
     */
    async getTenant(tenant_id) {
        return await this.api.get(`/access/tenants/${tenant_id}`)
    }

    /**
     * Get all tenants
     *
     * possible params:
     *  * limit
     *  * offset
     * @param {object} [params]
     */
    async getTenants(params) {
        return await this.api.get("/access/tenants", params)
    }

    /**
     * Update tenant by tenant_id
     * @param {string} tenant_id
     * @param {object} body
     */
    async updateTenant(tenant_id, body) {
        return await this.api.patch(`/access/tenants/${tenant_id}`, body)
    }

    /**
     * Create a new country for a tenant
     * @param {string} tenant_id
     * @param {object} body
     */
    async createCountry(tenant_id, body) {
        return await this.api.post(`/access/tenants/${tenant_id}/countries`, body)
    }

    /**
     * Get all countries from a tenant by tenant_id
     *
     * possible params:
     *  * limit
     *  * offset
     * @param {string} tenant_id
     * @param {object} [params]
     */
    async getCountries(tenant_id, params) {
        return await this.api.get(`/access/tenants/${tenant_id}/countries`, params)
    }
}

SDK.registerPlugin(Access)

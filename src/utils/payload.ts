import * as base64 from "base-64"

interface TokenPayload {
    iss: string
    iat: number
    nbf: number
    exp: number
    sub: string
    ten: string
    crt: boolean
    aud: string[]
    rls: string[]
    jti: string
}

export function getPayload(token: string): TokenPayload {
    if (!token || token.length < 0 || token.split(".").length <= 0) {
        // no token or invalid token equals no payload
        throw Error("Invalid Token format")
    }

    try {
        const payloadBase64 = token
            .split(".")[1]
            .replace("-", "+")
            .replace("_", "/")
        const payloadDecoded = base64.decode(payloadBase64)
        const payloadObject = JSON.parse(payloadDecoded)

        if (payloadObject.exp) {
            payloadObject.exp = new Date(payloadObject.exp * 1000)
        }

        return payloadObject
    } catch (err) {
        // return empty payload in case of an error
        throw Error("Invalid Token data")
    }
}

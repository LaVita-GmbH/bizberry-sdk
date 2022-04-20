const setCookie = (name, value, domain) => {
    if (value) {
        document.cookie = `${name}=${value}; max-age=31536000; domain=${domain}; path=/; secure`
        return
    }
    deleteCookie(name, domain)
}

const getCookie = name => {
    return document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)")?.pop() || undefined
}

const deleteCookie = (name, domain) => {
    document.cookie = `${name}=${undefined}; max-age=0; domain=${domain}; path=/; secure`
}

export { setCookie, getCookie, deleteCookie }

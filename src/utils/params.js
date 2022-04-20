export function querify(obj) {
    let qs = new URLSearchParams(),
        key

    for (key in obj) {
        if (obj.hasOwnProperty(key)) {
            const val = obj[key]
            if (Array.isArray(val)) {
                for (let i in val) {
                    qs.append(key, val[i])
                }
            } else {
                qs.append(key, val)
            }
        }
    }

    return qs
}

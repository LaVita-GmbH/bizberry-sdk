export class Focus {
    constructor(options) {
        this.refetchOnWindowFocus = options.refetchOnWindowFocus || false
        this.listeners = []
    }

    subscribe(listener) {
        if (!this.refetchOnWindowFocus) return

        this.listeners.push(listener)

        this.onSubscribe()

        return () => {
            this.listeners = this.listeners.filter(l => l !== listener)
        }
    }

    onSubscribe() {
        if (!this.removeEventListener) {
            this.setDefaultEventListener()
        }
    }

    setEventListener(setup) {
        if (this.removeEventListener) {
            this.removeEventListener()
        }
        this.removeEventListener = setup(focused => {
            if (typeof focused === "boolean") {
                this.setFocused(focused)
            } else {
                this.onFocus()
            }
        })
    }

    setFocused(focused) {
        this.focused = focused

        if (focused) {
            this.onFocus()
        }
    }

    onFocus() {
        this.listeners.forEach(listener => {
            listener()
        })
    }

    isFocused() {
        // document global can be unavailable in react native
        if (typeof document === "undefined") {
            return true
        }

        return [undefined, "visible", "prerender"].includes(document.visibilityState)
    }

    setDefaultEventListener() {
        this.setEventListener(onFocus => {
            const listener = () => onFocus()
            // Listen to visibillitychange and focus
            if (typeof window !== "undefined" && window.addEventListener) {
                window.addEventListener("visibilitychange", listener, false)
                window.addEventListener("focus", listener, false)
            }

            return () => {
                // Be sure to unsubscribe if a new handler is set
                window.removeEventListener("visibilitychange", listener)
                window.removeEventListener("focus", listener)
            }
        })
    }
}

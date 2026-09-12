"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { useSettingStore, type ColorTheme } from "@/stores/setting"

const META_BY_THEME: Record<ColorTheme, { light: string; dark: string }> = {
    default: { light: "#eae9e3", dark: "#413a2c" },
    zinc: { light: "#fafafa", dark: "#18181b" },
    slate: { light: "#f8fafc", dark: "#0f172a" },
    stone: { light: "#fafaf9", dark: "#1c1917" },
    neutral: { light: "#fafafa", dark: "#171717" },
    gray: { light: "#f9fafb", dark: "#111827" },
    blue: { light: "#f8fafc", dark: "#0b1220" },
    green: { light: "#f7fdf9", dark: "#0c1a12" },
    orange: { light: "#fffaf5", dark: "#1c120a" },
    rose: { light: "#fff7f8", dark: "#1a0c10" },
    violet: { light: "#faf8ff", dark: "#120f1c" },
}

function ThemeColorUpdater() {
    const { resolvedTheme } = useTheme()
    const colorTheme = useSettingStore((s) => s.colorTheme)

    React.useEffect(() => {
        const root = document.documentElement
        if (colorTheme && colorTheme !== "default") {
            root.setAttribute("data-color-theme", colorTheme)
        } else {
            root.removeAttribute("data-color-theme")
        }

        const metaThemeColor = document.querySelector('meta[name="theme-color"]')
        if (metaThemeColor) {
            const pair = META_BY_THEME[colorTheme] ?? META_BY_THEME.default
            metaThemeColor.setAttribute(
                "content",
                resolvedTheme === "dark" ? pair.dark : pair.light,
            )
        }
    }, [resolvedTheme, colorTheme])

    return null
}

export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
    return (
        <NextThemesProvider {...props}>
            <ThemeColorUpdater />
            {children}
        </NextThemesProvider>
    )
}

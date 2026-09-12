"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNavStore, type NavItem } from "@/components/modules/navbar"
import { ADVANCED_ROUTES, PRIMARY_ROUTES } from "@/route/config"
import { usePreload } from "@/route/use-preload"
import { ENTRANCE_VARIANTS } from "@/lib/animations/fluid-transitions"
import { useTranslations } from "next-intl"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

function NavButton({
    id,
    icon: Icon,
    label,
    isActive,
    index,
    onSelect,
    onHover,
}: {
    id: string
    icon: React.ComponentType<{ strokeWidth?: number; className?: string }>
    label: string
    isActive: boolean
    index: number
    onSelect: () => void
    onHover: () => void
}) {
    return (
        <motion.button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            onClick={onSelect}
            onMouseEnter={onHover}
            className={cn(
                "relative p-2 md:p-3 rounded-2xl z-20",
                isActive
                    ? "text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent",
            )}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
                opacity: 1,
                scale: 1,
                transition: { delay: index * 0.05, duration: 0.3 },
            }}
            whileHover={{ scale: 1.1, zIndex: 30 }}
            whileTap={{ scale: 0.95 }}
        >
            {isActive && (
                <motion.div
                    layoutId="navbar-indicator"
                    className="absolute inset-0 bg-sidebar-primary rounded-2xl z-0"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
            )}
            <span className="relative z-10">
                <Icon strokeWidth={2} />
            </span>
        </motion.button>
    )
}

export function NavBar() {
    const { activeItem, setActiveItem } = useNavStore()
    const { preload } = usePreload()
    const t = useTranslations("navbar")
    const [moreOpen, setMoreOpen] = useState(false)
    const advancedActive = ADVANCED_ROUTES.some((r) => r.id === activeItem)
    const [desktop, setDesktop] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia("(min-width: 768px)")
        const apply = () => setDesktop(mq.matches)
        apply()
        mq.addEventListener("change", apply)
        return () => mq.removeEventListener("change", apply)
    }, [])

    return (
        <div className="relative z-50 md:min-h-screen">
            <motion.nav
                aria-label="Main Navigation"
                className={cn(
                    "fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 p-3",
                    "md:sticky md:top-30 md:left-auto md:bottom-auto md:translate-x-0 md:flex-col md:gap-3",
                    "bg-sidebar text-sidebar-foreground border border-sidebar-border rounded-3xl",
                    "custom-shadow",
                )}
                variants={ENTRANCE_VARIANTS.navbar}
                initial="initial"
                animate="animate"
            >
                {PRIMARY_ROUTES.map((route, index) => (
                    <NavButton
                        key={route.id}
                        id={route.id}
                        icon={route.icon}
                        label={t(route.labelKey)}
                        isActive={activeItem === route.id}
                        index={index}
                        onSelect={() => setActiveItem(route.id as NavItem)}
                        onHover={() => preload(route.id)}
                    />
                ))}

                <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                    <PopoverTrigger asChild>
                        <motion.button
                            type="button"
                            title={t("more")}
                            aria-label={t("more")}
                            aria-expanded={moreOpen}
                            className={cn(
                                "relative p-2 md:p-3 rounded-2xl z-20",
                                advancedActive
                                    ? "text-sidebar-primary-foreground"
                                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent",
                            )}
                            whileHover={{ scale: 1.1, zIndex: 30 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            {advancedActive && (
                                <motion.div
                                    layoutId="navbar-indicator"
                                    className="absolute inset-0 bg-sidebar-primary rounded-2xl z-0"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                            <span className="relative z-10">
                                <MoreHorizontal strokeWidth={2} />
                            </span>
                        </motion.button>
                    </PopoverTrigger>
                    <PopoverContent
                        side={desktop ? "right" : "top"}
                        align="center"
                        sideOffset={12}
                        className="w-44 rounded-2xl border border-border/70 bg-card p-2 shadow-xl md:data-[side=right]:ml-1"
                    >
                        <div className="mb-1 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                            {t("more")}
                        </div>
                        <div className="grid gap-1">
                            {ADVANCED_ROUTES.map((route) => {
                                const active = activeItem === route.id
                                return (
                                    <button
                                        key={route.id}
                                        type="button"
                                        onMouseEnter={() => preload(route.id)}
                                        onClick={() => {
                                            setActiveItem(route.id as NavItem)
                                            setMoreOpen(false)
                                        }}
                                        className={cn(
                                            "flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition",
                                            active
                                                ? "bg-primary/10 text-primary"
                                                : "text-foreground hover:bg-muted/70",
                                        )}
                                    >
                                        <route.icon className="size-4 shrink-0" strokeWidth={2} />
                                        <span className="truncate">{t(route.labelKey)}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            </motion.nav>
        </div>
    )
}

import type { Variants } from 'motion/react';

// 缓动函数
export const EASING = {
    easeOutCubic: [0.25, 0.46, 0.45, 0.94] as const,
    easeOutExpo: [0.16, 1, 0.3, 1] as const,
    easeInOutCubic: [0.65, 0, 0.35, 1] as const,
    easeOutQuart: [0.25, 1, 0.5, 1] as const,
} as const;

// Spring 配置
export const SPRING = {
    smooth: {
        type: "spring" as const,
        stiffness: 80,
        damping: 20,
        mass: 1.2,
    },
    gentle: {
        type: "spring" as const,
        stiffness: 70,
        damping: 18,
        mass: 1.5,
    },
    bouncy: {
        type: "spring" as const,
        stiffness: 100,
        damping: 15,
        mass: 1,
    },
} as const;

/**
 * 磁性吸附进入动画
 */
export const ENTRANCE_VARIANTS = {
    // 导航栏进入 (Avoid CSS filter blur to prevent Safari WebKit compositing bug with backdrop-filter)
    navbar: {
        initial: {
            opacity: 0,
            scale: 0.9,
            y: 12,
        },
        animate: {
            opacity: 1,
            scale: 1,
            y: 0,
            transition: SPRING.smooth,
        },
    } as Variants,

    // 主内容进入 (Subtle scale to avoid WebKit font blur during transition)
    content: {
        initial: {
            scale: 0.98,
            y: 8,
            opacity: 0,
        },
        animate: {
            scale: 1,
            y: 0,
            opacity: 1,
            transition: {
                duration: 0.35,
                ease: EASING.easeOutExpo,
                delay: 0.05,
            },
        },
    } as Variants,

    // 头部进入
    header: {
        initial: {
            y: 16,
            opacity: 0,
        },
        animate: {
            y: 0,
            opacity: 1,
            transition: {
                duration: 0.4,
                ease: EASING.easeOutExpo,
                delay: 0.05,
            },
        },
    } as Variants,
};


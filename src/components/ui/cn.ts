/** Join class names, skipping falsy ones: cn('btn', active && 'active'). */
export const cn = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ')

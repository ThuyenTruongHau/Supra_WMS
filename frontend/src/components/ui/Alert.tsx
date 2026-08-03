import type { ReactNode } from 'react'
import { cn } from './utils/cn'

export type AlertVariant = 'error' | 'success' | 'info'

export interface AlertProps {
    variant?: AlertVariant
    children: ReactNode
    className?: string
}

const variantClass: Record<AlertVariant, string> = {
    error: 'bg-red-50 border-red-200 text-red-600',
    success: 'bg-green-50 border-green-200 text-green-700',
    info: 'bg-brand-primary/5 border-brand-primary/20 text-brand-dark',
}

export function Alert({ variant = 'info', children, className }: AlertProps) {
    return (
        <div
            className={cn(
                'rounded-xl border p-4 text-sm font-medium',
                variantClass[variant],
                className,
            )}
            role="alert"
        >
            {children}
        </div>
    )
}

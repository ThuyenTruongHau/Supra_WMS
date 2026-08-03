import type { ReactNode } from 'react'
import { Spin } from 'antd'
import { cn } from './utils/cn'

export interface LoadingProps {
    text?: ReactNode
    className?: string
    spinning?: boolean
}

export function Loading({
    text = 'Đang tải...',
    className,
    spinning = true,
}: LoadingProps) {
    return (
        <div
            className={cn(
                'flex h-64 items-center justify-center',
                className,
            )}
        >
            <Spin spinning={spinning}>
                <span className="text-brand-primary/70 font-medium">{text}</span>
            </Spin>
        </div>
    )
}

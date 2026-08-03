import type { HTMLAttributes, ReactNode } from 'react'
import { Card as AntCard, type CardProps as AntCardProps } from 'antd'
import { cn } from './utils/cn'

export type CardVariant = 'panel' | 'table'

type PanelCardProps = Omit<HTMLAttributes<HTMLDivElement>, 'title'> & {
    as?: 'panel'
    variant?: CardVariant
    title?: ReactNode
}

type AntdCardProps = AntCardProps & {
    as: 'antd'
    variant?: CardVariant
    title?: ReactNode
}

export type CardProps = PanelCardProps | AntdCardProps

const panelBaseClass =
    'rounded-xl bg-white border border-stripe-hairline shadow-stripe-1'

const variantClass: Record<CardVariant, string> = {
    panel: 'p-5',
    table: 'overflow-hidden p-0',
}

export function Card(props: CardProps) {
    const { variant = 'panel', title, className, children } = props

    const titleNode =
        title != null ? (
            <h3 className="mb-4 text-base font-semibold text-brand-dark">{title}</h3>
        ) : null

    if (props.as === 'antd') {
        const { as: _as, title: _title, variant: _variant, ...antdProps } = props
        return (
            <AntCard
                title={titleNode ?? undefined}
                className={cn(panelBaseClass, variantClass[variant], className)}
                {...antdProps}
            >
                {children}
            </AntCard>
        )
    }

    const { as: _as, title: _title, variant: _variant, className: _className, children: _children, ...divProps } = props
    return (
        <div
            className={cn(panelBaseClass, variantClass[variant], className)}
            {...divProps}
        >
            {titleNode}
            {children}
        </div>
    )
}

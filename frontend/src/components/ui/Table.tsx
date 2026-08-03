import { Table as AntTable, type TableProps as AntTableProps } from 'antd'
import { cn } from './utils/cn'

const tableClassName =
    '[&_.ant-table-thead_th]:!bg-stripe-canvas-soft [&_.ant-table-thead_th]:!text-brand-dark [&_.ant-table-thead_th]:!font-semibold [&_.ant-table-thead_th]:!text-sm [&_.ant-table-row]:hover:!bg-brand-primary/5'

export function Table<T extends object>({ className, ...props }: AntTableProps<T>) {
    return <AntTable<T> className={cn(tableClassName, className)} {...props} />
}

export type { TableProps } from 'antd/es/table'

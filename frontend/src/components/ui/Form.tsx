import type { ReactNode } from 'react'
import {
    Form as AntForm,
    type FormInstance,
    type FormItemProps,
    type FormProps,
} from 'antd'
import { cn } from './utils/cn'

const formClassName =
    '[&_.ant-form-item-label>label]:!text-brand-dark [&_.ant-form-item-label>label]:!font-semibold [&_.ant-form-item-label>label]:!text-sm'

type AppFormProps<T extends object> = Omit<FormProps<T>, 'children'> & {
    children?: ReactNode
}

function FormRoot<T extends object = Record<string, unknown>>({
    layout = 'vertical',
    className,
    children,
    ...props
}: AppFormProps<T>) {
    return (
        <AntForm<T>
            layout={layout}
            className={cn(formClassName, className)}
            {...props}
        >
            {children}
        </AntForm>
    )
}

export function FormItem({ className, ...props }: FormItemProps) {
    return <AntForm.Item className={className} {...props} />
}

type FormComponent = typeof FormRoot & {
    Item: typeof FormItem
    useForm: typeof AntForm.useForm
    useFormInstance: typeof AntForm.useFormInstance
    useWatch: typeof AntForm.useWatch
    List: typeof AntForm.List
    Provider: typeof AntForm.Provider
    ErrorList: typeof AntForm.ErrorList
}

export const Form = FormRoot as FormComponent

Form.Item = FormItem
Form.useForm = AntForm.useForm
Form.useFormInstance = AntForm.useFormInstance
Form.useWatch = AntForm.useWatch
Form.List = AntForm.List
Form.Provider = AntForm.Provider
Form.ErrorList = AntForm.ErrorList

export type { FormInstance, FormItemProps, FormProps }

import { Modal as AntModal, type ModalFuncProps, type ModalProps } from 'antd'
import { cn } from './utils/cn'

const modalClassName =
    '[&_.ant-modal-content]:!rounded-xl [&_.ant-modal-header]:!rounded-t-xl [&_.ant-form-item-label>label]:!text-brand-dark [&_.ant-form-item-label>label]:!font-semibold'

export interface AppModalProps extends ModalProps {
    titleClassName?: string
}

function ModalRoot({ className, title, ...props }: AppModalProps) {
    const titleNode =
        typeof title === 'string' ? (
            <span className="text-brand-dark font-semibold">{title}</span>
        ) : (
            title
        )

    return (
        <AntModal
            className={cn(modalClassName, className)}
            title={titleNode}
            {...props}
        />
    )
}

export interface ConfirmOptions extends ModalFuncProps {
    danger?: boolean
}

function confirm(options: ConfirmOptions) {
    const { danger, okType, ...rest } = options

    return AntModal.confirm({
        okText: 'Xác nhận',
        cancelText: 'Hủy',
        okType: danger ? 'danger' : okType,
        ...rest,
    })
}

function confirmDelete(options: Omit<ConfirmOptions, 'okType' | 'okText'>) {
    return confirm({
        title: 'Xác nhận xóa',
        okText: 'Xóa',
        danger: true,
        ...options,
    })
}

export const Modal = Object.assign(ModalRoot, {
    confirm,
    confirmDelete,
    info: AntModal.info,
    success: AntModal.success,
    error: AntModal.error,
    warning: AntModal.warning,
    destroyAll: AntModal.destroyAll,
    useModal: AntModal.useModal,
})

export type { ModalProps }

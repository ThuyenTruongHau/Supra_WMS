import { Modal as AntModal, type ModalFuncProps, type ModalProps } from 'antd'
import { operatorPopupContainer } from '@/components/layout/operatorStage'
import { cn } from './utils/cn'

const modalClassName =
    '[&_.ant-modal-content]:!rounded-xl [&_.ant-modal-header]:!rounded-t-xl [&_.ant-form-item-label>label]:!text-brand-dark [&_.ant-form-item-label>label]:!font-semibold'

export interface AppModalProps extends ModalProps {
    titleClassName?: string
}

function ModalRoot({
    className,
    title,
    centered = true,
    getContainer,
    ...props
}: AppModalProps) {
    const titleNode =
        typeof title === 'string' ? (
            <span className="text-brand-dark font-semibold">{title}</span>
        ) : (
            title
        )

    return (
        <AntModal
            {...props}
            className={cn(modalClassName, className)}
            title={titleNode}
            centered={centered}
            getContainer={getContainer ?? operatorPopupContainer}
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
        centered: true,
        okType: danger ? 'danger' : okType,
        getContainer: operatorPopupContainer,
        ...rest,
    })
}

function stageModal(method: (props: ModalFuncProps) => ReturnType<typeof AntModal.info>) {
    return (props: ModalFuncProps) =>
        method({
            getContainer: operatorPopupContainer,
            ...props,
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
    info: stageModal(AntModal.info),
    success: stageModal(AntModal.success),
    error: stageModal(AntModal.error),
    warning: stageModal(AntModal.warning),
    destroyAll: AntModal.destroyAll,
    useModal: AntModal.useModal,
})

export type { ModalProps }

import { message as antMessage, type MessageArgsProps } from 'antd'
import type { JointContent, TypeOpen } from 'antd/es/message/interface'

antMessage.config({
  top: '50vh',
  duration: 5,
  maxCount: 5,
})

const success: TypeOpen = (content, duration, onClose) =>
  antMessage.success(content, duration, onClose)

const error: TypeOpen = (content, duration, onClose) =>
  antMessage.error(content, duration, onClose)

const info: TypeOpen = (content, duration, onClose) =>
  antMessage.info(content, duration, onClose)

const warning: TypeOpen = (content, duration, onClose) =>
  antMessage.warning(content, duration, onClose)

const loading: TypeOpen = (content, duration, onClose) =>
  antMessage.loading(content, duration, onClose)

export const message = {
  success,
  error,
  info,
  warning,
  loading,
  destroy: antMessage.destroy,
  open: antMessage.open,
}

export type { MessageArgsProps, JointContent }

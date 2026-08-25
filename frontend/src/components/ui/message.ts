import { message as antMessage, type MessageArgsProps } from 'antd'
import type { JointContent, TypeOpen } from 'antd/es/message/interface'

const DEFAULT_MESSAGE_CONFIG = {
  /** Ant Design default is 8; 24 keeps clear of slim desktop chrome. */
  top: 24 as string | number,
  duration: 5,
  maxCount: 5,
  stack: false as boolean | { threshold?: number },
}

export function configureAppMessage(
  options?: Partial<typeof DEFAULT_MESSAGE_CONFIG>,
) {
  antMessage.config({
    ...DEFAULT_MESSAGE_CONFIG,
    ...options,
  })
}

configureAppMessage()

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
  config: configureAppMessage,
}

export type { MessageArgsProps, JointContent }

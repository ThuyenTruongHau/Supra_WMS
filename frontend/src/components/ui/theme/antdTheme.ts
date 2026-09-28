import type { ThemeConfig } from 'antd'
import { brand } from './tokens'

export const antdThemeConfig: ThemeConfig = {
  token: {
    colorPrimary: brand.primary,
    colorLink: brand.primary,
    colorInfo: brand.techAccent,
    colorSuccess: brand.success,
    colorWarning: brand.warning,
    colorError: brand.error,
    colorText: brand.dark,
    colorTextHeading: brand.dark,
    colorTextSecondary: brand.mute,
    colorBorder: brand.hairline,
    colorBgContainer: brand.panel,
    colorBgLayout: brand.canvas,
    borderRadius: 12,
    fontFamily: "'Outfit', system-ui, -apple-system, sans-serif",
  },
  components: {
    Button: {
      primaryShadow: 'none',
    },
    Modal: {
      borderRadiusLG: 12,
    },
    Input: {
      activeBorderColor: brand.primary,
      hoverBorderColor: brand.primary,
      activeShadow: `0 0 0 2px ${brand.techAccent}33`,
    },
    Select: {
      activeBorderColor: brand.primary,
      hoverBorderColor: brand.primary,
    },
  },
}

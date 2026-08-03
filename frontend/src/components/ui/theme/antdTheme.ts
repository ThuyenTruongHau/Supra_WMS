import type { ThemeConfig } from 'antd'
import { brand } from './tokens'

export const antdThemeConfig: ThemeConfig = {
    token: {
        colorPrimary: brand.primary,
        colorLink: brand.primary,
        colorTextHeading: brand.dark,
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
        },
    },
}

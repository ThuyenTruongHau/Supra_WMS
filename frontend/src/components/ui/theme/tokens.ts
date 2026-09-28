export const brand = {
  primary: '#168C87',
  dark: '#17363A',
  primaryDeep: '#0F6F6B',
  primarySoft: '#3AAFA9',
  techAccent: '#2F8FD8',
  canvas: '#F1F5F9',
  panel: '#FFFFFF',
  panelSoft: '#F8FAFC',
  sidebar: '#0F172A',
  sidebarHover: '#1E293B',
  hairline: '#D8E0EA',
  mute: '#587477',
  success: '#2F9E77',
  warning: '#D58A28',
  error: '#D9545D',
  /** @deprecated use techAccent — kept for chart compat */
  bgBlue: '#2F8FD8',
} as const

export const chartColors = [
  brand.primary,
  brand.dark,
  brand.techAccent,
  brand.mute,
] as const

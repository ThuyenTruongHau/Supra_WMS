/** Role canonical codes — khớp backend `app.core.permissions`. */
export const ROLE_ADMIN = 'A001'
export const ROLE_RAW_MATERIAL_OPERATOR = 'O001'
export const ROLE_FINISHED_PRODUCT_OPERATOR = 'O002'

export const ADMIN_HOME_PATH = '/report'
export const OPERATOR_HOME_PATH = '/overview'

export function isAdminRole(roleCanonical: string | null | undefined): boolean {
  return roleCanonical === ROLE_ADMIN
}

export function getHomePathForRole(roleCanonical?: string | null): string {
  return isAdminRole(roleCanonical) ? ADMIN_HOME_PATH : OPERATOR_HOME_PATH
}

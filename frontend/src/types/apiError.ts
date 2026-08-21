export interface ValidationErrorItem {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
}

export interface ApiErrorResponse {
  detail?: string | ValidationErrorItem[];
}

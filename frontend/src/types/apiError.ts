export interface ApiValidationErrorItem {
  type?: string;
  loc?: (string | number)[];
  msg?: string;
  input?: unknown;
}

export interface ApiErrorResponse {
  detail: string | ApiValidationErrorItem[] | Record<string, unknown>;
}

export function formatApiErrorDetail(
  detail: unknown,
  fallback = "Đã xảy ra lỗi",
): string {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          const validationItem = item as ApiValidationErrorItem;
          const loc = Array.isArray(validationItem.loc)
            ? validationItem.loc
                .filter((part) => typeof part === "string" || typeof part === "number")
                .join(".")
            : "";
          const msg = String(validationItem.msg ?? "");
          return loc ? `${loc}: ${msg}` : msg;
        }
        return null;
      })
      .filter((message): message is string => Boolean(message));

    return messages.length > 0 ? messages.join("\n") : fallback;
  }

  if (typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }

  return String(detail);
}

export function getApiErrorDetail(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "data" in err.response &&
    err.response.data &&
    typeof err.response.data === "object" &&
    "detail" in err.response.data
  ) {
    return formatApiErrorDetail(
      (err.response.data as ApiErrorResponse).detail,
      fallback,
    );
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return fallback;
}

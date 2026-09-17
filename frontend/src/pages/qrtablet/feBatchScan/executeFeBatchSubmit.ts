import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import type { FeBatchSendProgress, FeBatchSubmitResult } from "./feBatchScanTypes";

export type ExecuteFeBatchSubmitOptions<T> = {
  targets: string[];
  buildPayload: (qrCode: string) => T;
  mutate: (payload: T) => Promise<unknown>;
  onProgress?: (progress: FeBatchSendProgress) => void;
};

export async function executeFeBatchSubmit<T>({
  targets,
  buildPayload,
  mutate,
  onProgress,
}: ExecuteFeBatchSubmitOptions<T>): Promise<FeBatchSubmitResult> {
  const succeeded: string[] = [];
  const failed: FeBatchSubmitResult["failed"] = [];
  const total = targets.length;

  for (let index = 0; index < targets.length; index += 1) {
    const code = targets[index];
    onProgress?.({ current: index + 1, total });
    try {
      await mutate(buildPayload(code));
      succeeded.push(code);
    } catch (err) {
      failed.push({ code, error: getApiErrorMessage(err) });
    }
  }

  return { succeeded, failed };
}

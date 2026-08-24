import { useRef, type ChangeEvent } from "react";
import { UploadOutlined } from "@ant-design/icons";
import { message } from "antd";
import { Button } from "@/components/ui";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";
import { decodeQrFromFile } from "./decode";

/** Test-only: pick an image and decode QR via jsQR. */
export function QrImageImport({ onDecoded }: { onDecoded: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const onChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await decodeQrFromFile(file);
      if (!text) {
        message.warning("Không tìm thấy mã QR trong ảnh");
        return;
      }
      onDecoded(text);
    } catch (err) {
      message.error(getApiErrorMessage(err));
    } finally {
      input.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onChange(e)}
      />
      <Button
        variant="secondary"
        icon={<UploadOutlined />}
        className="!h-12 w-full"
        onClick={() => inputRef.current?.click()}
      >
        Import ảnh QR để test
      </Button>
    </>
  );
}

import { useCallback, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import { searchTransactionHistoryApi } from "@/api/transactionHistory";
import { QrImageImport } from "@/components/qr-scan";
import { Button, Card, Input, message } from "@/components/ui";
import BacklogHistoryTimeline from "@/pages/backlog/BacklogHistoryTimeline";
import BacklogLookupPreview from "@/pages/backlog/BacklogLookupPreview";
import type { TransactionHistoryLookupResponse } from "@/types/transactionHistory";
import { getApiErrorMessage } from "@/utils/apiErrorMessage";

export default function BacklogPage() {
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TransactionHistoryLookupResponse | null>(
    null,
  );

  const runSearch = useCallback(async () => {
    const query = searchValue.trim();
    if (!query) {
      message.warning("Vui lòng nhập mã QR hoặc mã đơn");
      return;
    }

    setLoading(true);
    try {
      const data = await searchTransactionHistoryApi(query);
      setResult(data);
    } catch (err) {
      setResult(null);
      message.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [searchValue]);

  const handleQrDecoded = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSearchValue(trimmed);
    message.success("Đã đọc mã QR từ ảnh");
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-brand-dark">Backlog</h2>
      </div>

      <Card className="min-h-[480px] !rounded-xl">
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              allowClear
              size="large"
              placeholder="Nhập mã QR hoặc mã đơn nhập / xuất..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onPressEnter={() => void runSearch()}
              className="!h-12 flex-1"
            />
            <div className="flex shrink-0 gap-2">
              <Button
                variant="primary"
                icon={<SearchOutlined />}
                loading={loading}
                className="!h-12 min-w-[120px]"
                onClick={() => void runSearch()}
              >
                Tìm kiếm
              </Button>
              <QrImageImport
                label="Import ảnh QR"
                className="!h-12 !w-auto min-w-[160px] shrink-0"
                onDecoded={handleQrDecoded}
              />
            </div>
          </div>

          {result ? (
            <div className="space-y-6 border-t border-slate-100 pt-6">
              <BacklogLookupPreview data={result} />
              <BacklogHistoryTimeline data={result} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Tra cứu theo mã QR để xem tồn kho và giao dịch, hoặc theo mã đơn
              để xem lịch sử trạng thái.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

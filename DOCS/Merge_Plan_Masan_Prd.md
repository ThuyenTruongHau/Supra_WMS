# Kế Hoạch Đưa Nhánh `feature/integrate-frontend` Lên Production (`masan_prd`)

## 1. Tổng quan (Overview)
- **Từ nhánh hiện tại:** `feature/integrate-frontend`
- **Tới nhánh đích (Production):** `masan_prd`
- **Khối lượng thay đổi:** Rất lớn. Tôi đã phân tích diff giữa 2 nhánh và thấy có khoảng **179 file thay đổi**, với hơn **74,000 dòng code thêm mới**. 
- **Phạm vi tác động:** Phần lớn tập trung vào việc làm mới và tích hợp toàn diện giao diện Frontend (React/Vite). Bao gồm việc thêm/sửa hàng loạt các components, hooks (`useInbound`, `useOutbound`, `useSortingWave`...), các tiện ích xuất nhập Excel, và đặc biệt là hệ thống vẽ bản đồ kho (`WarehouseMapCanvas`, `OperatorMapCanvas`).

## 2. Các Bước Chuẩn Bị Trước Khi Merge (Pre-Merge Preparation)

**2.1. Xử lý trạng thái local hiện tại:**
Bạn đang có một số file chưa được đưa vào commit (unstaged) ở nhánh `feature/integrate-frontend`:
- `docker-compose.yml`
- `frontend/Dockerfile`
*Hành động:* Nếu những thay đổi cấu hình Docker này là cần thiết cho bản Production, hãy `git add` và commit chúng. Nếu chỉ là cấu hình chạy test ở local, hãy `git stash` lại hoặc loại bỏ.
- Ngoài ra bạn có rất nhiều file sinh ra trong quá trình đánh giá (các file `diff_*.txt`, `*_Evaluation.md`, `.gemini-scratch-git-log.txt`). Đừng commit chúng lên môi trường prd, hãy xoá chúng hoặc đưa vào `.gitignore`.

**2.2. Khuyến nghị Review Code:**
Với lượng thay đổi quá lớn, **KHÔNG NÊN** tự merge trực tiếp ở local rồi đẩy thẳng lên server. Hãy tạo một **Pull Request (PR)** hoặc **Merge Request** từ `feature/integrate-frontend` vào `masan_prd` trên Github/Gitlab để xem xét lần cuối.

**2.3. Backup Dữ liệu (Database Backup):**
Mặc dù 99% thay đổi nằm ở Frontend, nhưng cẩn thận không bao giờ thừa. Hãy backup cơ sở dữ liệu của môi trường `masan_prd` trước khi tiến hành cập nhật.

## 3. Các Bước Thực Hiện Merge (Nếu làm qua Command Line)

Nếu bạn bắt buộc phải merge thủ công dưới local, hãy làm theo đúng thứ tự sau:

```bash
# 1. Cập nhật nhánh prd mới nhất từ remote
git fetch origin
git checkout masan_prd
git pull origin masan_prd

# 2. Thực hiện Merge (Dùng cờ --no-ff để tạo một Merge Commit rõ ràng trong lịch sử)
git merge --no-ff feature/integrate-frontend -m "Merge feature/integrate-frontend into masan_prd for final deployment"
```

**Xử lý Xung đột (Conflict Resolution):** 
Nếu xảy ra conflict, hãy đặc biệt cẩn trọng với các file cốt lõi như `frontend/vite.config.ts`, `frontend/src/store/useAppStore.ts` hay `frontend/src/hooks/useAuth.ts`. Đảm bảo code chạy được ở local (`npm run build`) trước khi đánh dấu resolved.

```bash
# 3. Đẩy lên server triển khai
git push origin masan_prd
```

## 4. Kế Hoạch Test Sau Khi Lên Môi Trường Production
Vì thay đổi frontend là thay máu diện rộng, QA (hoặc bạn) cần Test Regression kỹ các luồng sau trên môi trường thật:
- **Luồng Đăng Nhập / Phân quyền (Auth):** Có sự thay đổi lớn trong cơ chế auth session. Cần đăng nhập thử bằng tài khoản Admin và Operator.
- **Bản Đồ Kho (Warehouse Layout):** Kiểm tra tính năng render canvas (`OperatorMapCanvas`).
- **Luồng Nhập / Xuất Kho (Inbound & Outbound):** Test tính năng kéo thả, xác nhận Inbound, Import/Export Excel.
- **Luồng Soạn Hàng (Sorting Wave):** (Tính năng mới hoặc được làm lại rất nhiều).

## 5. Triển khai (Deployment)
- Dựa trên file `docker-compose.yml` và `Dockerfile` vừa sửa, thực hiện build lại image và up service:
  ```bash
  docker-compose up -d --build
  ```
- **Lưu ý quan trọng:** Hãy yêu cầu người dùng (hoặc cấu hình tự động) **Clear Cache trình duyệt**, vì bộ UI mới hoàn toàn có thể bị dính cache Javascript cũ gây lỗi trắng trang.

## 6. Phương Án Dự Phòng (Rollback Plan)
Nếu ứng dụng sập hoặc có lỗi nghiêm trọng trên Production không thể hotfix ngay:
- Revert lại commit merge:
  ```bash
  git checkout masan_prd
  git log -n 5 # Lấy mã hash của merge commit
  git revert -m 1 <Mã-Hash-Của-Merge-Commit>
  git push origin masan_prd
  ```
- Redeploy lại cấu hình Docker cũ.

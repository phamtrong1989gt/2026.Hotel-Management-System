// main.routes — route của MODULE NGHIỆP VỤ App.Modules.PMS (module chính, tên logic `Main`, D1 của khung FE). features/pages.routes.ts CHỈ mount `...MAIN_ROUTES`; mỗi màn mới của Main thêm MỘT khối ở đây
// (cùng khuôn CATEGORY_ROUTES của lõi). Vỏ mới CHƯA có màn nghiệp vụ nào ⇒ mảng rỗng; `/gen-module` thêm khối cho từng module sinh ra.
//
// QUY ƯỚC:
//   • `path` = kebab của tên controller = RouterLink của adm.RoleController đã đăng ký ở SSO / script seed quyền — ĐỔI path là làm menu mất màn.
//   • Mỗi route MỘT đối tượng `{ path: '<kebab>', loadComponent: () => import('./<kebab>/<kebab>.component').then(c => c.<Pascal>Component), data: { breadcrumb: '' } }`
//     (hoặc `loadChildren: () => import('./<kebab>/<kebab>.routes').then(r => r.<UPPER_SNAKE>_ROUTES)` khi màn có route con).
//   • KHÔNG route `:id` / `create` / `edit` (hộp Thêm / Sửa là dialog mở từ danh sách).
//   • Khi nhiều module sinh SONG SONG: mỗi module một khối bao bằng hai dòng chú thích `// ── module NN <Tên> ──` … `// ── hết module NN ──`, chỉ sửa BÊN TRONG khối của mình, cách khối kề ≥ 2 dòng
//     không đổi để gộp nhánh không xung đột.
// Đứng TRƯỚC route '**' của pages.routes.ts (đã đảm bảo ở nơi mount).
import { Routes } from '@angular/router';

export const MAIN_ROUTES: Routes = [
  // (chưa có màn nghiệp vụ nào — /gen-module sẽ thêm khối ở đây)
];

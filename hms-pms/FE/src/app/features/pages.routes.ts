import { Routes } from '@angular/router';
import { PagesComponent } from './pages.component';
import { CATEGORY_ROUTES } from '@modules/category/category.routes';
import { ACCOUNT_ROUTES } from '@modules/identity/account/account.routes';
import { NOTIFICATION_ROUTES } from '@modules/notification/notification.routes';
import { AUDIT_LOG_ROUTES } from '@modules/audit-log/audit-log.routes';
import { PLATFORM_ROUTES } from '@modules/platform/platform.routes';
import { OPERATIONS_ROUTES } from '@modules/operations/operations.routes';
import { MAIN_ROUTES } from './main/main.routes';

/**
 * Bảng route con của khung `PagesComponent` (cha `manage/:roleCode` có AuthGuard ở app.routes.ts).
 * KHÔNG sửa tệp này khi thêm màn nghiệp vụ PMS: mọi màn của module nghiệp vụ App.Modules.PMS khai ở `features/main/main.routes.ts` (MAIN_ROUTES) — xem README.md của FE.
 */
export const routes: Routes = [
  {
    path: '',
    component: PagesComponent,
    children: [
      {
        // TRANG ĐÍCH sau đăng nhập / đổi vai trò / "về trang đầu" = Bàn làm việc của CORE (vai trò đang dùng + bản đồ chức năng theo quyền; menu do SSO trả theo
        // adm.RoleController đã đăng ký cho PMS) — không gọi API riêng nên vai trò nào cũng mở được. Muốn trang đích riêng thì đổi component ở ĐÂY (tệp của app).
        path: '',
        loadComponent: () => import('@modules/identity/account/home/account-home.component').then(c => c.AccountHomeComponent),
        data: { breadcrumb: '' }
      },
      // ⭐ Account (sau đăng nhập) = module chung (@modules/identity/account)
      ...ACCOUNT_ROUTES,
      // ⭐ Category (Đơn vị · Tỉnh · Phường/Xã · Quốc gia; ở Linked chỉ-xem) = module chung (@modules/category)
      ...CATEGORY_ROUTES,
      // Messaging administration (provider, route, template, delivery audit).
      ...NOTIFICATION_ROUTES,
      // Nhật ký hành động (adm.Log) — chỉ đọc
      ...AUDIT_LOG_ROUTES,
      ...PLATFORM_ROUTES,     // Platform (cấu hình hệ thống, bảo trì, thương hiệu)
      ...OPERATIONS_ROUTES,   // Operations (giám sát, lịch sử thay đổi, thống kê, cảnh báo)
      // KHÔNG có STORAGE_EXPLORER_ROUTES: vỏ mới chưa lưu tệp qua File API nên chưa cần Kho lưu trữ — muốn thêm: khai `storage-explorer` ở fe-app.json → sharedModules rồi trải route vào đây (import { STORAGE_EXPLORER_ROUTES } from '@modules/storage-explorer/storage-explorer.routes').
      // Màn của module nghiệp vụ dự án App.Modules.PMS: MỌI màn khai ở features/main/main.routes.ts (MAIN_ROUTES) — KHÔNG khai thẳng ở đây (nhiều module sinh song song không được cùng sửa tệp này).
      ...MAIN_ROUTES,
      {
        // Trang giới thiệu (khung trống — không nội dung; dựng nội dung theo dự án ở landing-page.component.ts).
        path: 'landing-page',
        loadComponent: () => import('./landing-page/landing-page.component').then(c => c.LandingPageComponent),
        data: { breadcrumb: '' }
      },
      {
        // Màn không còn hoặc gõ sai → về Bàn làm việc của vai trò đang chọn (không khớp route thì spinner toàn màn quay mãi). PHẢI đứng CUỐI children.
        path: '**',
        redirectTo: ''
      }
    ]
  }
];

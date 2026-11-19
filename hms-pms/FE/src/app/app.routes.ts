import { Routes } from '@angular/router';
import { AuthGuard } from '@core/http/auth.guard';
import { ErrorComponent } from './features/error/error.component';
import { SsoLoginEntryGuard } from '@modules/sso-client/sso-login-entry.guard';
import { SsoLocalScreenGuard } from '@modules/sso-client/sso-local-screen.guard';
import { environment } from '../environments/environment';

/** Màn đăng nhập cục bộ (nạp lazy — dùng chung cho `/` và `/login`). */
const loginScreen = () => import('@modules/identity/account/login/login.component').then((c) => c.LoginComponent);

/** /doc-v3 = tài liệu dev-facing → CHỈ cho phép ở non-production (canMatch). */
const docOnlyInDev = () => !environment.production;

/**
 * Tài liệu cũ /doc (v1) và /doc-v2 đã gỡ — link cũ (tài liệu, ghi chú code) chuyển về trang /doc-v3 tương ứng.
 * Khoá = đoạn đầu sau /doc-v2/ (hoặc /doc/); không có trong bảng → trang chủ /doc-v3.
 */
const LEGACY_DOC_TO_V3: Record<string, string> = {
  'ct-forms-api': 'forms', 'ct-field': 'forms', 'ct-text': 'forms', 'input': 'forms', 'ct-select': 'forms',
  'select': 'forms', 'autocomplete-api': 'forms', 'ct-checkbox': 'forms', 'ct-radio': 'forms', 'selection': 'forms',
  'slider': 'forms', 'ct-date': 'forms', 'datepicker': 'forms', 'datetimepicker': 'forms', 'ct-misc': 'forms', 'form': 'forms',
  'ct-info': 'info', 'ct-upload': 'upload', 'editor': 'editor', 'tree': 'tree', 'tree-view': 'tree',
  'button': 'buttons', 'button-toggle': 'buttons', 'menu': 'buttons',
  'table': 'data', 'lists': 'data', 'chips': 'data', 'badge': 'data', 'states': 'data',
  'cards': 'cards', 'tabs': 'tabs', 'grids': 'grids', 'expansion': 'expansion',
  'sidenav': 'layout', 'toolbar': 'layout', 'stepper': 'layout',
  'dialog': 'overlays', 'dialog-parts': 'overlays', 'popups': 'overlays', 'bottom-sheet': 'overlays',
  'snackbar': 'overlays', 'tooltip': 'overlays', 'progress': 'progress',
  'tokens': 'tokens', 'theme-system': 'tokens', 'architecture': 'architecture', 'app-bootstrap': 'core',
  'services-catalog': 'services', 'missing-shared': 'services',
  'base-crud-page': 'base', 'base-list-deep': 'base', 'scaffold': 'base', 'inline-edit': 'base', 'column-config': 'base',
  'pattern-analytics-dashboard': 'patterns', 'pattern-gallery-verification': 'patterns', 'pattern-map-integration': 'patterns',
  'pattern-multi-tab-dialog': 'patterns', 'pattern-report-generation': 'patterns', 'pattern-status-workflow': 'patterns',
  'pattern-tree-management': 'patterns',
};
const legacyDocRedirect: Routes = [
  { path: '', pathMatch: 'full', redirectTo: '/doc-v3' },
  {
    path: '**',
    redirectTo: ({ url }) => {
      const target = LEGACY_DOC_TO_V3[url[0]?.path ?? ''];
      return target ? `/doc-v3/${target}` : '/doc-v3';
    },
  },
];

export const routes: Routes = [
  {
    path: 'manage/:roleCode',
    loadChildren: () => import('./features/pages.routes').then((p) => p.routes),
    canActivate: [AuthGuard],
  },
  { path: 'doc', children: legacyDocRedirect },
  { path: 'doc-v2', children: legacyDocRedirect },
  {
    path: 'doc-v3',
    canMatch: [docOnlyInDev], // doc-v3 = tài liệu API Reference (AI + coder).
    loadChildren: () => import('@platform/doc-v3/doc-v3.routes').then((p) => p.routes),
    data: { breadcrumb: 'Docs v3' },
  },
  { path: 'doc-v3', redirectTo: '' }, // prod: showcase tắt → về login
  // G2b/C3 (2026-11-01): cổng vào = SsoLoginEntryGuard BỌC LoginRedirectGuard — Linked: vào lạnh tự chuyển sang SSO (có lý do / lặp thì hiện trang có nút); không phải Linked: hành vi cũ (hiện form).
  // 2026-11-02: ba màn đăng nhập CỤC BỘ nạp LAZY (loadComponent chạy SAU canActivate) — bản Linked bị guard chuyển đi nên không tải mã form đăng nhập; gói chính cũng không còn chứa chúng.
  { path: '', loadComponent: loginScreen, canActivate: [SsoLoginEntryGuard], data: { breadcrumb: 'Login' } },
  { path: 'login', loadComponent: loginScreen, canActivate: [SsoLoginEntryGuard], data: { breadcrumb: 'Login' } },
  {
    path: 'change-password-first-login',
    loadComponent: () =>
      import('@modules/identity/account/change-password-first-login/change-password-first-login.component').then(
        (c) => c.ChangePasswordFirstLoginComponent,
      ),
    canActivate: [SsoLocalScreenGuard],
    data: { breadcrumb: 'change-password-first-login' },
  },
  // G2b/C3: các màn đăng nhập CỤC BỘ dưới đây bị ẩn ở Linked (SsoLocalScreenGuard ⇒ /login); API tương ứng cũng đã 404 ở Linked.
  {
    path: 'verify-otp',
    loadComponent: () => import('@modules/identity/account/verify-otp/verify-otp.component').then((c) => c.VerifyOtpComponent),
    canActivate: [SsoLocalScreenGuard],
    data: { breadcrumb: 'verify-otp' },
  },
  // Dọn C1 (2026-10-30; module identity chung 2026-11-02): đã gỡ route `enroll-two-factor` (cài 2FA bắt buộc lúc đăng nhập — BE không còn enrollTwoFactorStart/Confirm).
  {
    // 11.173 (roadmap #11): điểm quay về sau khi xác thực ở hệ thống danh tính (Authorization Code + PKCE).
    path: 'sso-callback',
    loadComponent: () => import('@modules/identity/account/sso/sso-callback.component').then((c) => c.SsoCallbackComponent),
    canActivate: [SsoLocalScreenGuard],
    data: { breadcrumb: 'sso-callback' },
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('@modules/identity/account/forgot-password/forgot-password.component').then(
        (c) => c.ForgotPasswordComponent,
      ),
    canActivate: [SsoLocalScreenGuard],
    data: { breadcrumb: 'forgot-password' },
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('@modules/identity/account/reset-password/reset-password.component').then((c) => c.ResetPasswordComponent),
    canActivate: [SsoLocalScreenGuard],
    data: { breadcrumb: 'reset-password' },
  },
  // G2b/C3 + C4: hai đích quay về của SSO — KHÔNG có guard (guard sẽ tạo vòng lặp sso_error ↔ AuthGuard ↔ SsoStart). /sso-return = hoàn tất đăng nhập / báo lỗi / phiên đã kết thúc; /logged-out = sau đăng xuất tập trung.
  {
    path: 'sso-return',
    loadComponent: () => import('@modules/sso-client/sso-return/sso-return.component').then((c) => c.SsoReturnComponent),
    data: { breadcrumb: 'sso-return' },
  },
  {
    path: 'logged-out',
    loadComponent: () => import('@modules/sso-client/sso-logged-out/sso-logged-out.component').then((c) => c.SsoLoggedOutComponent),
    data: { breadcrumb: 'logged-out' },
  },
  { path: 'error', component: ErrorComponent, data: { breadcrumb: 'error' } },
  // review 2026-10-06 R6-m1: URL lạ (bookmark cũ, gõ sai) trước đây không khớp route nào → NG04002 chỉ ở console, spinner toàn màn (mặc định
  // BẬT) không ai hạ → trang trắng quay mãi. Về trang lỗi 404 sẵn có (ErrorComponent tự hạ spinner). PHẢI đứng CUỐI danh sách.
  { path: '**', redirectTo: '/error?code=404' },
];

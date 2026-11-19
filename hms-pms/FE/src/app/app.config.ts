import { APP_INITIALIZER, ApplicationConfig, importProvidersFrom, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BrandingService, brandingInitializerFactory } from '@core/services/branding.service';
import { provideNativeDateAdapter, MAT_DATE_LOCALE, DateAdapter as MatDateAdapter } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { PtNativeDateAdapter } from '@core/services/custom-date-adapter';
import { CustomMatPaginatorIntl } from '@ui/custom-mat-paginator-intl';
import { provideGSnackbarErrorNotifier } from '@ui/feedback/g-snackbar/g-snackbar-error-notifier';
import { PreloadAllModules, provideRouter, withInMemoryScrolling, withPreloading } from '@angular/router';

import { routes } from './app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CustomOverlayContainer } from '@theme/utils/custom-overlay-container';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { CalendarModule, DateAdapter } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns'; 
import { provideTranslateLoader, provideTranslateService, TranslateService } from '@ngx-translate/core';
import { HttpClient } from '@angular/common/http';
import { PlatformTranslateLoader } from '@core/i18n/platform-translate-loader';
import { jwtInterceptor } from '@core/http/jwt.interceptor';
import { cryptoInterceptor } from '@core/http/crypto.interceptor';
import { provideStorageNamespace } from '@core/storage/storage-namespace';
import { errorInterceptor } from '@core/http/error.interceptor';
import { syncInterceptor } from '@core/http/sync.interceptor';
import { uploadProgressInterceptor } from '@core/http/upload-progress.interceptor';
import { provideApiBase } from '@core/config/api-config';
import { provideCategory } from '@modules/category/category.config';
import { provideAccount } from '@modules/identity/account/account.config';
import { AccountService } from '@modules/identity/account/account.service';
import { CryptoConfigError } from '@core/services/crypto-service.service';
import { provideNotification } from '@modules/notification/notification.config';
import { provideSsoClient } from '@modules/sso-client/sso-client.config';
import { DeploymentModeService } from '@modules/sso-client/deployment-mode.service';
import { provideSystemConfigMode } from '@modules/platform/platform.config';
import { provideAuditLog, provideObjectHistoryDialog } from '@modules/audit-log/audit-log.config';
import { environment } from '../environments/environment';

export function HttpLoaderFactory(http: HttpClient) {
  // Merge i18n platform (module/ui-shared) + i18n app. (Nguồn thứ 3 "nhãn tự sửa" qua API đã gỡ cùng TranslationsController ở dọn C1 2026-10-30.)
  // Thứ tự thắng: app > platform.
  return new PlatformTranslateLoader(http);
}

export function appInitializerFactory(translate: TranslateService) {
  // 11.180: TRẢ VỀ promise để Angular ĐỢI nạp xong nhãn rồi mới dựng giao diện — nếu không, màn đầu nháy khóa thô một nhịp.
  // Loader nuốt lỗi từng nguồn và luôn phát ra kết quả, nên máy chủ chưa lên cũng không treo ứng dụng.
  // Initializer này đăng ký SAU securityInitializerFactory: lớp nhãn tự sửa đi qua API, mà API dùng phong bì mã hóa nên
  // khóa công khai phải sẵn sàng trước — đăng ký ngược lại thì lần nạp đầu lặng lẽ mất lớp nhãn tự sửa.
  return () => {
    return firstValueFrom(translate.use('vi')).catch(() => undefined);
  };
}

export function securityInitializerFactory(accountService: AccountService) {
  // Khởi tạo public key RSA sớm cho mọi module có request hybrid. Nếu API tạm thời chưa sẵn sàng,
  // vẫn cho app hiển thị; AccountService sẽ thử lại khi người dùng thực hiện luồng xác thực.
  //
  // NGOẠI LỆ — CryptoConfigError không được nuốt. Nuốt lỗi mạng là đúng (chờ chút rồi thử lại là xong),
  // nhưng khóa cấu hình sai kiểu thì thử lại vô nghĩa, mà chạy tiếp còn tệ hơn: nếu chuỗi dán nhầm là
  // PRIVATE key thì app vẫn hoạt động trơn tru trong khi khóa bí mật nằm sẵn trong bundle cho bất kỳ
  // ai mở F12. Chết lúc khởi động là cách duy nhất bắt buộc người triển khai phải nhìn thấy.
  return () =>
    Promise.resolve()
      .then(() => accountService.getPublicSecuritySettings())
      .catch((error) => {
        if (error instanceof CryptoConfigError) throw error;
        return undefined;
      });
}

/**
 * Khoá RSA MỒI của môi trường (public key nhúng bundle) — đọc từ environment CỦA ỨNG DỤNG này rồi cấp cho module identity chung qua provideAccount({ cryptoBootstrap }):
 * module chung KHÔNG import `environments/environment` (KIT-01). Khai kiểu tường minh: các environment.*.ts không còn trường cryptoBootstrapKid — đọc qua kiểu tuỳ chọn thay vì truy cập thẳng.
 */
const cryptoBootstrapEnv: { cryptoBootstrapKid?: string; cryptoBootstrapPublicKeySpkiB64?: string } = environment;

export const appConfig: ApplicationConfig = {
  providers: [
    // Namespace khoá localStorage/sessionStorage + tên BroadcastChannel của ứng dụng này (D-CORE-84): hai FE cùng origin sau gateway theo tiền tố KHÔNG đè token / ngôn ngữ của nhau.
    // Phải khớp fe-app.json → storageNamespace (cổng check:storage kiểm). PMS KHÔNG phải chủ cũ của origin (chủ cũ là một phần mềm có sẵn từ trước) ⇒ legacyMigration:false: không đọc / xoá khoá không tiền tố — nếu chung origin với phần mềm khác thì không "nhận" AccountInfo cũ của nó (cổng check:storage STORE-03b canh).
    provideStorageNamespace('pms', { legacyMigration: false }),
    // provideZoneChangeDetection({ eventCoalescing: true }), 
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      // Enable auto-scroll khi route có fragment (#anchor) + restore scroll position khi back/forward
      withInMemoryScrolling({
        anchorScrolling: 'enabled',
        scrollPositionRestoration: 'enabled',
      }),
    ),
  provideAnimationsAsync(),
  provideNativeDateAdapter(),
  // App tiếng Việt → date adapter phải dùng locale vi-VN, nếu không date hiện MM/dd/yyyy (en-US).
  // MAT_DATE_LOCALE ở component KHÔNG có tác dụng vì DateAdapter là singleton ROOT → phải đặt Ở ĐÂY.
  { provide: MAT_DATE_LOCALE, useValue: 'vi-VN' },
  // Override DateAdapter (đặt SAU provideNativeDateAdapter để thắng) → ép datetime hiện đúng thứ tự
  // dd/MM/yyyy HH:mm:ss (native + vi-VN trả time-first). Date-only vẫn dùng native như cũ.
  { provide: MatDateAdapter, useClass: PtNativeDateAdapter },
  // P1-8 (2026-09-29): nhãn phân trang tiếng Việt cho TOÀN app ở injector gốc. Trước chỉ provide ở AppComponent (injector node) →
  // mat-paginator trong MatDialog / overlay (dựng bằng injector gốc) hiện tiếng Anh, mỗi hộp phải tự provide lại.
  { provide: MatPaginatorIntl, useClass: CustomMatPaginatorIntl },
  // 2026-10-01: toast lỗi HTTP chung (errorInterceptor) cùng kiểu g-snackbar — core khai ERROR_NOTIFIER, ui cấp bản này. Bỏ dòng = toast thô cũ.
  provideGSnackbarErrorNotifier(),
    provideHttpClient(withXhr(), 
      // 11.150: syncInterceptor đọc X-*-Version. review 2026-10-06 (lượt 2 n-C): uploadProgressInterceptor PHẢI đứng cuối (sát backend) —
      // nghe tiến độ tải lên ngoài zone rồi đưa sự kiện về zone trước khi tới các interceptor khác.
      withInterceptors([jwtInterceptor, cryptoInterceptor, errorInterceptor, syncInterceptor, uploadProgressInterceptor])
    ),
    importProvidersFrom(CalendarModule.forRoot({
      provide: DateAdapter,
      useFactory: adapterFactory
    })),
    { provide: OverlayContainer, useClass: CustomOverlayContainer },
    // Platform đọc API base qua token (KHÔNG reach src/environments) — app cấp từ environment của mình.
    provideApiBase({
      baseApiUrl: environment.baseApiUrl,
      baseReportUrl: environment.baseReportUrl,
    }),
    // ⭐ CONFIG MODULE NGHIỆP VỤ (starter @modules) — `{}` = dùng BE/path gốc (app này khớp default).
    //    Project mới BE khác → override TẠI ĐÂY, KHÔNG sửa lõi module:
    //      provideCategory({ endpoints: { ward: '/api/v2/ward' } }),
    //    (xem từng *.config.ts + knowledge/FE_BE_CONTRACT.md)
    provideCategory({}),
    // Khoá mồi lấy từ environment của ứng dụng này (module identity chung không đọc environment — KIT-01).
    provideAccount({ cryptoBootstrap: { publicKeySpkiB64: cryptoBootstrapEnv.cryptoBootstrapPublicKeySpkiB64, kid: cryptoBootstrapEnv.cryptoBootstrapKid } }),
    provideNotification({}),
    provideAuditLog({}),
    // Module chung sso-client (nối SSO ở chế độ Linked, nguồn chung src/Core/FE/modules/sso-client): ứng dụng cấp nguồn cấu hình công khai (AccountService) + địa chỉ cổng SSO (tuỳ chọn — chỉ environment.linked.ts / gateway khai).
    // Standalone: module KHÔNG làm gì (DeploymentModeService báo không phải Linked ⇒ giữ nguyên form đăng nhập).
    // `deploymentMode` = chế độ khai sẵn lúc build (chỉ environment.linked.ts khai 'Linked'): bản Linked biết mình là Linked không cần chờ API ⇒ API chết cũng KHÔNG rơi về form đăng nhập cục bộ.
    provideSsoClient({
      publicSettingsSource: AccountService,
      ssoPortalUrl: (environment as Record<string, unknown>)['ssoPortalUrl'] as string | undefined,
      deploymentMode: (environment as Record<string, unknown>)['deploymentMode'] as string | undefined,
    }),
    // Màn Cấu hình hệ thống CHỈ XEM ở chế độ Linked (coder 2026-11-02): BE khoá ghi module SystemConfig qua DeploymentReadOnlyModules (kể cả quản trị tối cao), giao diện chỉ phản ánh — cấp chế độ triển khai của sso-client cho màn.
    // Standalone: readOnlyModules rỗng ⇒ màn vẫn sửa được như trước.
    provideSystemConfigMode(DeploymentModeService),
    // Nút ⋮ "Lịch sử" + nút đầu hộp Sửa mở popup nhúng Nhật ký hành động (không gắn → chuyển sang màn Nhật ký như cũ).
    provideObjectHistoryDialog(),
    // ngx-translate 18: TranslateModule.forRoot() đã bỏ → provideTranslateService + provideTranslateLoader (factory chạy trong ngữ cảnh inject).
    // fallbackLang thay setDefaultLang('vi') của bản 16 (nhãn thiếu ở ngôn ngữ đang dùng rơi về tiếng Việt).
    provideTranslateService({
      fallbackLang: 'vi',
      loader: provideTranslateLoader(() => HttpLoaderFactory(inject(HttpClient))),
    }),
    {
      // ĐẶT TRƯỚC appInitializerFactory: khóa công khai phải có trước khi nạp nhãn (nhãn tự sửa đi qua API có phong bì mã hóa).
      provide: APP_INITIALIZER,
      useFactory: securityInitializerFactory,
      deps: [AccountService],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: appInitializerFactory,
      deps: [TranslateService],
      multi: true
    },
    {
      // 11.176 (roadmap #14): thương hiệu theo triển khai — nạp trước khi dựng giao diện để không nháy tên/màu cũ.
      provide: APP_INITIALIZER,
      useFactory: brandingInitializerFactory,
      deps: [BrandingService],
      multi: true
    },
  ]
};

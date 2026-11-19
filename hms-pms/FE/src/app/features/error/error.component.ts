import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { Settings, SettingsService } from '@core/services/settings.service';
import { AppStorageService } from '@core/services/app.storage.service';
import { RoleContextService, firstUsableRole, hasAnyRole } from '@core/services/role-context.service';
import { GButtonComponent } from '@ui/button/g-button.component';
import { AccountService } from '@modules/identity/account/account.service';
import { normalizeErrorCode } from './error-code.util';

/**
 * Trang lỗi theo `?code=` — 2026-10-01: giao diện về vỏ xác thực lõi (.g-auth-shell / .g-auth-card) + g-button; bỏ MatCard /
 * MatSidenav (không dùng) và 2 import thừa (date-fns `set`, `Subscription`).
 */
@Component({
  selector: 'app-error',
  templateUrl: './error.component.html',
  imports: [MatIconModule, GButtonComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true
})
export class ErrorComponent {
  code: number = 404;
  name: string = "Page not found";
  public settings: Settings;

  // review 2026-10-07 vòng 2 m3: tài khoản KHÔNG có vai trò nào (đăng nhập có "Ghi nhớ") bị nhốt giữa /error 403 và '/' — guard cố ý giữ phiên,
  // nút duy nhất "Quay lại" → '/' → guard → lại /error 403; máy dùng chung thì người khác không đăng nhập được tới khi thẻ làm mới hết hạn.
  // Nay trang lỗi (401/403/409) mà trình duyệt CÒN phiên → có nút "Đăng xuất" (thu hồi phiên phía máy chủ như menu tài khoản rồi dọn phiên,
  // về /login); riêng ca không có vai trò: báo rõ lý do + ẩn nút "Quay lại" (bấm chỉ lặp lại trang này).
  private readonly appStorage = inject(AppStorageService);
  private readonly roleContext = inject(RoleContextService);
  private readonly accountService = inject(AccountService);
  /** Trình duyệt còn giữ phiên đăng nhập (AccountInfo có thẻ). */
  hasSession = false;
  /** Còn phiên nhưng tài khoản không có vai trò nào ở bất kỳ đơn vị nào. */
  noRole = false;
  /**
   * rv5 D-03 / rv6 FE-4: còn phiên, CÓ vai trò nhưng không vai trò nào dùng được lúc này (khung giờ / mạng — guard đưa tới với
   * `reason=policy-blocked`). Tính từ GÓI TÀI KHOẢN đang giữ (hasAnyRole && !firstUsableRole — cùng luật guard), KHÔNG tin `?reason=` trên URL
   * (link chế sẵn không đổi được giao diện). Ca này GIỮ nút "Thử lại" ('/' → LoginRedirectGuard tải lại gói, cách nhau ≥ 30 s): vào khung giờ /
   * đổi sang mạng được phép là vào lại được, không phải đăng xuất rồi đăng nhập lại (mật khẩu + OTP).
   */
  policyBlocked = false;
  logoutLoading = false;

  /** Mã lỗi liên quan phiên / quyền — chỉ các trang này mới có nút Đăng xuất. */
  get showLogout(): boolean { return this.hasSession && [401, 403, 409].includes(Number(this.code)); }

  /** Icon đầu thẻ theo mã lỗi (chỉ trình bày). */
  get icon(): string {
    switch (Number(this.code)) {
      case 404: return 'search_off';
      case 403: return 'block';
      case 401: return 'lock_clock';
      case 409: return 'devices';
      default: return 'error_outline';
    }
  }

  constructor(
    private appSettings: SettingsService, 
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.settings = this.appSettings.settings;
  }

  /**
   * Hook vòng đời `ngOnInit`: theo dõi `?code=` của URL và dựng lại trang lỗi mỗi lần tham số đổi.
   * Mã hiển thị KHÔNG lấy nguyên giá trị URL mà đi qua `normalizeErrorCode` (danh sách đóng 401/403/404/409/500, còn lại → 404) — chặn lừa đảo nội dung
   * kiểu `/error?code=<câu tự do>` (review an ninh 2026-11-04 FE-2). Tác dụng phụ: đăng ký một subscription theo ActivatedRoute (như cũ, Angular dọn khi route bị huỷ); mỗi lần phát
   * gán `code` / `name`, tắt spinner chung sau 1 giây (getErrorCode) và đọc phiên đang giữ (readSession, không gọi API).
   */
  ngOnInit(
  ) {
    this.route.queryParams.subscribe(params => {
      this.code = normalizeErrorCode(params['code']);
      this.getErrorCode(this.code);
      void this.readSession();
    });
  }

  /** review 2026-10-07 vòng 2 m3: đọc phiên đang giữ (không gọi API) → bật nút Đăng xuất / câu "chưa có vai trò". */
  private async readSession(): Promise<void> {
    let account: any = null;
    try { account = await this.appStorage.getAccountInfo(); } catch { account = null; }
    this.hasSession = !!account?.token;
    const departments: any[] = Array.isArray(account?.departments) ? account.departments : [];
    this.noRole = this.hasSession && Number(this.code) === 403
      && !departments.some((d: any) => Array.isArray(d?.roles) && d.roles.length > 0);
    // rv6 FE-4: suy từ gói tài khoản (không từ ?reason=) — có vai trò mà không vai trò nào dùng được lúc này.
    this.policyBlocked = this.hasSession && Number(this.code) === 403 && !this.noRole
      && hasAnyRole(account) && !firstUsableRole(account);
  }

  /** Câu phụ đề: lý do cụ thể (không vai trò / bị chính sách chặn) thắng câu chung theo mã. */
  get subtitleKey(): string | null {
    return this.noRole ? 'error-page.no-role' : this.policyBlocked ? 'error-page.policy-blocked' : null;
  }

  goHome(): void {
    this.router.navigate(['/']);
  }

  /**
   * review 2026-10-07 vòng 2 m3: đăng xuất từ trang lỗi — cùng đường với menu tài khoản (PagesComponent.logout): gọi Logout thu hồi phiên +
   * họ thẻ làm mới phía máy chủ (lỗi mạng vẫn dọn phiên trên trình duyệt), dọn AccountInfo + danh mục + ngữ cảnh vai trò, về /login.
   */
  async logout(): Promise<void> {
    if (this.logoutLoading) return;
    this.logoutLoading = true;
    try {
      await this.accountService.logout();
    } catch {
      // không thu hồi được phía máy chủ — phiên trên trình duyệt vẫn được dọn bên dưới
    } finally {
      this.appStorage.removeAccountInfo();
      this.appStorage.removeCategoryData();
      this.roleContext.reset();
      this.logoutLoading = false;
      this.hasSession = false;
      this.noRole = false;
      this.policyBlocked = false;
      await this.router.navigate(['/login']);
    }
  }

  getErrorCode(code: number) {
    if (code == 404) {
      this.name = "Trang không tồn tại vui lòng kiểm tra lại";
    }
    else if (code == 500) {
      this.name = "Internal Server Error";
    }
    else if (code == 409) {
      this.name = "Tài khoản của bạn vừa được đăng nhập từ nơi khác, vui lòng đăng nhập lại";
    }
    else if (code == 403) {
      this.name = "Tài khoản không có quyền truy cập, vui lòng kiểm tra lại hoặc quay lại";
    }
    else if (code == 401) {
      this.name = "Tài khoản hết hiệu lực vui lòng quay lại trang đăng nhập";
    }
    else {
      this.name = "Unexpected Error";
    }
    setTimeout(() => {
    this.settings.loadingSpinner = false;
    }, 1000);
  }

  ngAfterViewInit() {
  }
}
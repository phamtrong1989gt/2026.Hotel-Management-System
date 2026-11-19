import { Component, inject, ChangeDetectorRef, AfterViewInit, ChangeDetectionStrategy, OnInit, DestroyRef, effect, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { CustomMatPaginatorIntl } from '@ui/custom-mat-paginator-intl';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { Settings, SettingsService } from '@core/services/settings.service';
import { NgClass } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {  } from '@ngx-translate/core';
import { SessionIdleService } from '@core/services/session-idle.service';
import { SessionLockComponent } from '@modules/identity/account/session-lock/session-lock.component';
import { DeploymentModeService } from '@modules/sso-client/deployment-mode.service';
import { SsoLinkedSessionService } from '@modules/sso-client/sso-linked-session.service';
import { filter } from 'rxjs/operators';

/**
 * review 2026-10-06 R6-M5 (sửa sau review MAJOR-2): điều hướng = KẾT THÚC PHIÊN thì mọi hộp thoại phải đóng — /login (đăng xuất, endSession,
 * tab khác đăng xuất) và /error?code=401|409 (phiên hết / đăng nhập nơi khác — legacyLogout, errorInterceptor). /error vì 500 / 403 thoáng qua
 * KHÔNG đóng: hộp Sửa toàn màn (khảo sát + lượt tải video) giữ nguyên dữ liệu đang nhập như trước đợt này, người dùng tự đóng / thử lại.
 */
function isSessionExitUrl(url: string): boolean {
  const [pathPart, queryPart = ''] = url.split('?');
  const path = pathPart.split('#')[0];
  if (/^\/(?:login|sso-return|logged-out)(?:\/|$)/.test(path)) return true;   // G2b: ở Linked, kết thúc phiên đi qua /sso-return và /logged-out (không phải /login)
  if (!/^\/error(?:\/|$)/.test(path)) return false;
  const code = new URLSearchParams(queryPart.split('#')[0]).get('code');
  return code === '401' || code === '409';
}

@Component({
    selector: 'app-root',
    imports: [
        RouterOutlet,
        NgClass,
        MatProgressSpinnerModule,
        SessionLockComponent
    ],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss',
    changeDetection: ChangeDetectionStrategy.Eager,
    providers: [
      { provide: MatPaginatorIntl, useClass: CustomMatPaginatorIntl }
    ]
})
export class AppComponent implements OnInit, AfterViewInit {
  settingsService = inject(SettingsService);
  settings: Settings = this.settingsService.settings;
  private cdr = inject(ChangeDetectorRef);
  readonly sessionIdle = inject(SessionIdleService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mode = inject(DeploymentModeService);
  private readonly linkedSession = inject(SsoLinkedSessionService);
  /** C4: tín hiệu "đang chạy chế độ Linked" — template ẩn màn khoá của platform khi true (không có mật khẩu cục bộ để mở khoá). */
  readonly linked = this.mode.linked;

  /**
   * C4 (cycle G2b): ở chế độ Linked, màn khoá của platform là ngõ cụt (mở khoá bằng `UnlockSession` đã bị ẩn ở BE). Hiệu ứng này theo dõi `sessionIdle.locked()`: khoá xảy ra
   * (hết thời gian không thao tác phía FE, nút khoá của thanh bên platform…) thì kết thúc phiên MỀM — {@link SsoLinkedSessionService.endForIdle}: thu hồi thẻ làm mới cục bộ,
   * dọn phiên rồi sang `/sso-return?reason=idle` (trang có nút). Không phải Linked thì không làm gì (hành vi cũ: hiện màn khoá).
   */
  constructor() {
    effect(() => {
      if (this.sessionIdle.locked() && this.mode.linked()) untracked(() => void this.linkedSession.endForIdle());
    });
  }


  ngOnInit() {
    void this.mode.ensureLoaded();   // C2: nạp chế độ triển khai sớm để `linked()` đúng trước khi có thể khoá màn
    this.sessionIdle.initialize();
    // review 2026-10-06 R6-M5: kết thúc phiên (SessionIdleService.endSession — kể cả do tab khác đăng xuất / thu hồi phiên), đăng xuất,
    // jwtInterceptor.legacyLogout, errorInterceptor (401/409 → /error) đều chỉ router.navigate. MatDialog `closeOnNavigation` chỉ
    // đóng khi back/forward (popstate), KHÔNG đóng khi router.navigate → hộp Sửa (dữ liệu nghiệp vụ) còn nổi trên form đăng nhập / trang lỗi.
    // Bắt MỘT chỗ chung: lượt điều hướng KẾT THÚC PHIÊN (isSessionExitUrl) đóng hết hộp thoại (dự án không dùng MatBottomSheet / overlay tự dựng).
    this.router.events
      .pipe(
        filter((e): e is NavigationStart => e instanceof NavigationStart && isSessionExitUrl(e.url)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.dialog.openDialogs.length) this.dialog.closeAll();
      });
  }

  ngAfterViewInit() {
    // Fix ExpressionChangedAfterItHasBeenCheckedError
    this.cdr.detectChanges();
  }
}

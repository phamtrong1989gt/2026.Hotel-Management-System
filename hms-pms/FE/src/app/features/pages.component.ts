import { appLocalStorage } from '@core/storage/ns-storage';
import { ChangeDetectionStrategy, Component, ElementRef, HostListener, effect, inject, OnDestroy, OnInit, untracked, ViewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { Settings, SettingsService } from '@core/services/settings.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FlexLayoutModule } from '@ngbracket/ngx-layout';
import { GButtonComponent } from '@ui/button/g-button.component';
import { SidenavComponent } from '@layout/sidenav/sidenav.component';
import { FullScreenComponent } from '@layout/fullscreen/fullscreen.component';
import { ApplicationsComponent } from '@layout/applications/applications.component';
import { UserMenuComponent } from '@layout/user-menu/user-menu.component';
import { CommonModule } from '@angular/common';
import { MenuService } from '@layout/menu/menu.service';
import { RoleContextService, parseRoleCodePath } from '@core/services/role-context.service';
import { AppStorageService } from '@core/services/app.storage.service';
import { AccountService } from '@modules/identity/account/account.service';
import { GSnackbarService } from '@ui/feedback/g-snackbar/g-snackbar.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SessionIdleService } from '@core/services/session-idle.service';
import { SyncService, SyncNotice } from '@core/services/sync.service';
import { MaintenanceBannerComponent } from '@layout/maintenance-banner/maintenance-banner.component';
import { ConfigReadinessChipComponent } from '@layout/config-readiness/config-readiness-chip.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { BrandingService } from '@core/services/branding.service';
import { APP_SKINS, USER_SKIN_KEY, findSkin } from '@core/config/skins';
import { formatCountdown } from '@core/utils/format.util';
import { DeploymentModeService } from '@modules/sso-client/deployment-mode.service';
import { SsoLinkedSessionService } from '@modules/sso-client/sso-linked-session.service';

@Component({
  selector: 'app-pages',
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    FlexLayoutModule,
    TranslatePipe,
    GButtonComponent,
    SidenavComponent,
    FullScreenComponent,
    ApplicationsComponent,
    MaintenanceBannerComponent,
    ConfigReadinessChipComponent,
    UserMenuComponent,
  ],
  providers: [MenuService],
  templateUrl: './pages.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pages.component.scss',
})
export class PagesComponent implements OnInit, OnDestroy {
  private readonly accountService = inject(AccountService);
  private readonly gSnack = inject(GSnackbarService);
  private readonly sync = inject(SyncService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);
  readonly sessionIdle = inject(SessionIdleService);   // 11.161c: template đọc lockCountdown()
  private readonly deploymentMode = inject(DeploymentModeService);
  private readonly linkedSession = inject(SsoLinkedSessionService);
  /** G2b/C4: tín hiệu "đang chạy chế độ Linked" — template ẩn nút "Khoá màn hình" (không có mật khẩu cục bộ để mở khoá). */
  readonly linked = this.deploymentMode.linked;
  // 2026-09-27 (coder: "branding đang không thấy có tác dụng"): tiêu đề ở thanh công cụ trên cùng — bề mặt thương
  // hiệu DỄ THẤY NHẤT (mọi trang, mọi lúc) — trước bị bỏ sót, hardcode cứng "Hệ thống AI phân tích video UAV phục
  // vụ đánh giá cầu đường" nên đổi Thương hiệu → AppName không cập nhật gì ở đây (chỉ đổi document.title + tên/logo
  // thanh bên). BrandingService đã nạp appName lúc khởi động ứng dụng (APP_INITIALIZER) nên có sẵn ngay.
  readonly branding = inject(BrandingService);
  // 2026-11-02 (coder: màn hiện nhầm tên "UAV…" của dự án khác khi API chưa lên): bỏ tên dự phòng cứng — chưa nạp được thương hiệu thì để trống, không in tên sản phẩm sai.
  get appTitle(): string { return this.branding.appName; }

  @ViewChild('sidenav') sidenav: any;
  @ViewChild('backToTop') backToTop: any;
  @ViewChild('mainSidenavContent') mainSidenavContent: any;
  @ViewChild('mainContent') mainContent: ElementRef;

  public settings: Settings;
  public lastScrollTop: number = 0;
  public showBackToTop: boolean = false;
  public toggleSearchBar: boolean = false;
  private defaultMenu: string; //declared for return default menu when window resized
  public showSidenav: boolean = false;
  public currentHotel: any = null;
  currentDate: Date = new Date();
  logoutLoading = false;
  /** review 2026-10-06 R6-M4: ngOnInit đã nạp context + bật đồng bộ (mở khoá thì bật lại; trước lúc đó thì chưa). */
  private syncWanted = false;
  private lockedBefore = false;
  /** review 2026-10-06 R6 (lượt 2 n-D): ngOnInit phải kéo cả gói danh mục (storage thiếu/hỏng) mà chưa kéo được — mở khoá thì kéo lại. */
  private catalogPending = false;

  constructor(
    public settingsService: SettingsService,
    public router: Router,
    private menuService: MenuService,
    private roleContext: RoleContextService,
    private appStorage: AppStorageService,
  ) {
    this.settings = this.settingsService.settings;
    // review 2026-10-06 R6-M4: màn khoá nay KHÔNG huỷ Pages (giữ router-outlet, phủ lớp khoá lên trên) → trước đây ngừng đồng bộ nền nhờ
    // ngOnDestroy; nay ngừng/bật lại theo locked() trực tiếp. Mở khoá = UnlockSession đã ghi AccountInfo MỚI (vai trò/quyền có thể đã đổi
    // trong lúc khoá) → áp lại vào RoleContext + báo sidenav dựng lại như lần dựng Pages mới trước đây, rồi bật đồng bộ.
    effect(() => {
      const locked = this.sessionIdle.locked();
      untracked(() => this.onLockChanged(locked));
    });
  }

  private onLockChanged(locked: boolean): void {
    if (locked) {
      this.lockedBefore = true;
      this.sync.stop();
      return;
    }
    if (!this.lockedBefore) return;
    this.lockedBefore = false;
    if (!this.syncWanted) return;   // khoá từ lúc mở trang (tab khác đang khoá) — ngOnInit tự bật đồng bộ khi chạy tới
    void this.appStorage.getAccountInfo().then((accountInfo) => {
      // endSession cũng bỏ khoá (rồi xoá phiên) → không có tài khoản thì thôi, đang về /login
      if (this.destroyRef.destroyed || this.sessionIdle.locked() || !accountInfo?.token) return;
      this.roleContext.applyAccountInfo(accountInfo);
      this.roleContext.changed$.next({ kind: 'account' });
      this.sync.start();
      // R6 (lượt 2 n-D): lượt kéo danh mục của ngOnInit bị bỏ (423 — khoá đúng lúc đó) hoặc bị stop() cắt ngang → kéo lại sau khi đã start().
      if (this.catalogPending) void this.loadMissingCatalog();
    });
  }

  /**
   * 11.160 (review m10) + review 2026-10-06 R6 (lượt 2 n-D): kéo CẢ GÓI danh mục khi storage thiếu/hỏng. Đây là request nền — khoá màn xảy ra
   * đúng lúc này (F5 tab khi tab khác vừa khoá, giải mã đua với initialize) thì bị bỏ ⇒ menu trống tới lượt đồng bộ kế. Chưa kéo được thì giữ
   * cờ, onLockChanged kéo lại ngay khi mở khoá.
   */
  private async loadMissingCatalog(): Promise<void> {
    this.catalogPending = true;
    const ok = await this.sync.refreshCatalog(true);
    if (ok) this.catalogPending = false;
  }

  async ngOnInit() {
    // Defer mutation past current change-detection cycle to avoid NG0100
    // (AppComponent reads settings.loadingSpinner cùng tick CD này).
    queueMicrotask(() => {
      this.settings.loadingSpinner = true;
    });

    // Áp brand color của skin đã lưu ra html root ngay khi load (phần tử ngoài #app — overlay CDK đã nằm trong #app, xem applyBrandColor)
    this.applyBrandColor(this.settings.theme);

    // Redirect to /login if router.url is null or empty
    if (!this.router || !this.router.url || this.router.url === '' || this.router.url === null) {
      this.router.navigate(['/login']);
      return;
    }
    if (window.innerWidth <= 768) {
      this.settings.menu = 'vertical';
      this.settings.sidenavIsOpened = false;
      this.settings.sidenavIsPinned = false;
    }
    this.defaultMenu = this.settings.menu;

    // Khởi tạo context định tuyến trước điểm await đầu tiên. Angular có thể tạo
    // Dashboard con ngay khi ngOnInit async yield; RoleCode phải sẵn sàng trước đó.
    const url = this.router.url;
    const match = url.match(/manage\/([^\/]+)/);
    let currentRoleCode = '';
    let currentDepartment = 0;
    if (match) {
      this.roleContext.currentRoleCodePath = match[1];
      ({ roleCode: currentRoleCode, departmentId: currentDepartment } = parseRoleCodePath(match[1]));   // 11.160: '-' cuối
    }
    this.roleContext.currentRoleCode = currentRoleCode;
    this.roleContext.currentDepartment = currentDepartment;

    // review 2026-10-06 R6-M4: Pages nay được dựng cả khi đang khoá (mở tab mới lúc tab khác đang khoá — router-outlet không còn bị @if
    // gỡ). Chờ mở khoá rồi mới nạp context + bật đồng bộ — đúng thứ tự cũ (trước đây Pages chỉ được dựng SAU khi mở khoá) và dùng
    // AccountInfo mới mà UnlockSession ghi. Phiên kết thúc trong lúc chờ → thôi (đang về /login).
    const waitedUnlock = this.sessionIdle.locked();
    if (waitedUnlock) {
      await this.sessionIdle.whenUnlocked();
      if (this.destroyRef.destroyed || !this.appStorage.hasAccountInfo()) return;
    }

    // Load data (11.150: cùng một đường apply* với SyncService — menu newRouterLink + allowActions tính ở RoleContextService)
    const [accountInfo, categoryData] = await Promise.all([
      this.appStorage.getAccountInfo(),
      this.appStorage.getCategoryData(),
    ]);
    if (this.destroyRef.destroyed) return;   // khóa màn / rời /manage trong lúc đọc storage
    this.roleContext.applyAccountInfo(accountInfo);
    this.roleContext.applyCategoryData(categoryData);
    // R6 (sửa sau review MAJOR-1): màn con dựng TRONG lúc khoá (yêu cầu nền như "Việc cần làm" bị bỏ vì đang khoá) → báo đọc lại ngữ cảnh.
    if (waitedUnlock) this.roleContext.changed$.next({ kind: 'account' });

    // 11.150: storage tự cập nhật theo phiên bản server (header mọi response · quay lại tab · tab khác) — thông báo cho người dùng ở đây
    this.sync.notice$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((n) => this.onSyncNotice(n));
    // review 2026-10-08 MAJOR-1 / MINOR-6: thông báo phát TRƯỚC khi trang dựng (guard chuyển khỏi vai trò bị chặn, 403 trước start(), "đã chuyển vai trò"
    // giữ qua lần nạp lại trang) — hiện bây giờ.
    for (const pending of this.sync.takePendingNotices()) this.onSyncNotice(pending);
    this.syncWanted = true;   // review 2026-10-06 R6-M4: từ đây mở khoá là bật lại đồng bộ (onLockChanged)
    if (!this.sessionIdle.locked()) this.sync.start();
    // review 2026-10-08 MAJOR-1: F5 — cờ "vai trò bị chính sách chặn" đọc từ storage là ảnh chụp cũ → kiểm lại gói tài khoản (giãn ≥ 30 s; vai trò
    // đang dùng nay bị chặn thì SyncService tự chuyển vai trò). Máy chủ vẫn tự chặn ở mỗi request.
    void this.sync.recheckAccount();
    // 11.160 (review m10): thiếu/hỏng một ô PullData:{key} → getCategoryData() trả null → menu trống sau F5 và sync nhận mốc đầu nên không
    // bao giờ tự tải lại. Kéo cả gói trước khi dựng shell (như lúc đăng nhập).
    if (!categoryData) await this.loadMissingCatalog();
    this.settings.loadingSpinner = false;
  }

  ngAfterViewInit() {
    // 11.160 (review M5): bỏ timer 300 ms hạ spinner — nó đua với giải mã storage ở ngOnInit; máy chậm thì shell dựng với context rỗng
    // (menu trống, roleKey {} → nút hiện hết) và không tự sửa. Spinner hạ đúng lúc ở cuối ngOnInit.
    if (this.backToTop && this.backToTop.nativeElement) {
      this.backToTop.nativeElement.style.display = 'none';
    }
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {   // 11.160 (review m13): Pages hủy mỗi lần khóa màn
      if (event instanceof NavigationEnd) {
        if (!this.settings.sidenavIsPinned) {
          this.sidenav.close();
        }
        if (window.innerWidth <= 768) {
          this.sidenav.close();
        }
      }
    });

    if (this.settings.menu == 'vertical') {
      //this.menuService.expandActiveSubMenu(this.menuService.getVerticalMenuItems());
    }
  }

  // 6 màu base (skin) — danh sách dùng CHUNG ở @core/config/skins (màn Thông tin phần mềm chọn skin mặc định từ đúng danh sách này).
  public themes = APP_SKINS;

  public changeTheme(theme: string) {
    this.settings.theme = theme;
    appLocalStorage.setItem(USER_SKIN_KEY, theme); // lựa chọn RIÊNG của người dùng — thắng skin mặc định của nơi triển khai, giữ sau reload
    this.applyBrandColor(theme);
  }

  // Ghi màu brand của skin lên documentElement (html) — chỉ có tác dụng với phần tử nằm NGOÀI #app (vd thư viện ngoài tự gắn
  // thẳng vào <body>), và giữ :root cùng giá trị BrandingService đặt lúc khởi động. Overlay CDK (dialog / menu / tooltip / snackbar)
  // KHÔNG cần tới nó: CustomOverlayContainer (@theme/utils/custom-overlay-container, provide ở app.config) gắn
  // .cdk-overlay-container VÀO TRONG #app (= .app.<skin>) nên overlay kế thừa --app-brand của skin qua cascade; trong #app giá
  // trị ở .app / .app.<skin> (theme/_theme.scss) luôn che giá trị ở html này.
  private applyBrandColor(theme: string) {
    const color = findSkin(theme)?.color;
    if (color) document.documentElement.style.setProperty('--app-brand', color);
  }

  public toggleSidenav() {
    this.sidenav.toggle();
  }

  public onPageScroll(event: any) {
    event.target.scrollTop > 300
      ? (this.backToTop.nativeElement.style.display = 'flex')
      : (this.backToTop.nativeElement.style.display = 'none');
    if (this.settings.menu == 'horizontal') {
      if (this.settings.fixedHeader) {
        var currentScrollTop = event.target.scrollTop > 56 ? event.target.scrollTop : 0;
        if (currentScrollTop > this.lastScrollTop) {
          document.querySelector('#horizontal-menu')!.classList.add('sticky');
          event.target.classList.add('horizontal-menu-hidden');
        } else {
          document.querySelector('#horizontal-menu')!.classList.remove('sticky');
          event.target.classList.remove('horizontal-menu-hidden');
        }
        this.lastScrollTop = currentScrollTop;
      } else {
        if (event.target.scrollTop > 56) {
          document.querySelector('#horizontal-menu')!.classList.add('sticky');
          event.target.classList.add('horizontal-menu-hidden');
        } else {
          document.querySelector('#horizontal-menu')!.classList.remove('sticky');
          event.target.classList.remove('horizontal-menu-hidden');
        }
      }
    }
  }

  public scrollToTop() {
    this.mainSidenavContent.scrollTo({
      top: 0,
    });
    this.mainContent.nativeElement.scrollTo({
      duration: 100,
      top: 0,
    });
  }

  @HostListener('window:resize')
  public onWindowResize(): void {
    if (window.innerWidth <= 768) {
      this.settings.sidenavIsOpened = false;
      this.settings.sidenavIsPinned = false;
      this.settings.menu = 'vertical';
    } else {
      this.defaultMenu == 'horizontal' ? (this.settings.menu = 'horizontal') : (this.settings.menu = 'vertical');
      this.settings.sidenavIsOpened = true;
      this.settings.sidenavIsPinned = true;
    }
  }

  public closeSubMenus() {
    let menu = document.querySelector('.sidenav-menu-outer');
    if (menu) {
      for (let i = 0; i < menu.children[0].children.length; i++) {
        let child = menu.children[0].children[i];
        if (child) {
          if (child.children[0].classList.contains('expanded')) {
            child.children[0].classList.remove('expanded');
            child.children[1].classList.remove('show');
          }
        }
      }
    }
  }

  /** 11.161c: tooltip nút khóa — "Khóa màn hình · tự khóa sau 27 phút". 11.166: đọc từ signal lockCountdown khi đang đếm (giây) — không gọi Date.now() trong
   *  template (mỗi lần kiểm đổi giá trị → NG0100 ExpressionChanged ở dev); ngoài vùng đếm chỉ hiện số PHÚT (đổi 1 lần/phút). */
  lockTooltip(): string {
    const sec = this.sessionIdle.lockCountdown();
    // Chưa rê lần nào → nhãn gốc (không rỗng: matTooltip bỏ qua lượt hiện khi message rỗng lúc mouseenter của nó chạy trước của ta)
    if (sec == null) return this.lockTipSnapshot || this.translate.instant('account-menu.lock-screen');
    return this.translate.instant('account-menu.lock-screen') + ' · '
      + this.translate.instant('account-menu.lock-auto-in', { time: this.formatRemaining(sec * 1000) });
  }

  /** Chữ tooltip ngoài phút cuối — CHỤP lúc rê chuột / focus vào nút (2026-10-01). Trước đây tính remainingMs() (Date.now()) ngay trong
   *  binding: lượt change detection rơi đúng mốc phút thì lần kiểm lại của dev ra số khác → NG0100 ("14 phút" → "13 phút") mỗi phút. */
  lockTipSnapshot = '';
  refreshLockTip(): void {
    const base = this.translate.instant('account-menu.lock-screen');
    const ms = this.sessionIdle.remainingMs();
    this.lockTipSnapshot = ms < 0 ? base
      : base + ' · ' + this.translate.instant('account-menu.lock-auto-in', { time: this.translate.instant('account-menu.minutes', { n: Math.ceil(ms / 60000) }) });
  }

  /** m:ss khi < 10 phút; "27 phút" (i18n, làm tròn LÊN) khi dài hơn. 2026-10-01: phần m:ss dùng formatCountdown của lõi
   *  (cùng phép tính — trước chép tay); phần phút giữ i18n account-menu.minutes (formatDurationShort làm tròn khác + chữ cứng). */
  formatRemaining(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    if (s >= 600) return this.translate.instant('account-menu.minutes', { n: Math.ceil(s / 60) });
    return formatCountdown(s);
  }

  /**
   * Khoá màn hình. Chế độ thường: khoá giao diện, mở lại bằng mật khẩu. Chế độ Linked (G2b/C4): không có mật khẩu cục bộ để mở khoá nên "khoá" = kết thúc phiên mềm
   * ({@link SsoLinkedSessionService.endForIdle}). Cả hai nút khoá (thanh trên và dải nút nhanh của thanh bên — `[lockVisible]="!linked()"`, 2026-11-18 gỡ nợ Q7) đã ẩn ở Linked; nhánh Linked ở đây giữ để an toàn nếu ai đó hiện lại. Đồng hồ tự khoá khi không thao tác vẫn chạy: hiệu ứng ở AppComponent bắt khoá và kết thúc phiên mềm.
   */
  lockScreen(): void {
    if (this.deploymentMode.isLinked) {
      void this.linkedSession.endForIdle();
      return;
    }
    this.sessionIdle.lockSession();
  }

  /** 11.152 (review B1): màn khóa / rời /manage hủy Pages → ngừng đồng bộ (không gọi API khi đang khóa, không ghi storage sau khi rời). */
  ngOnDestroy(): void {
    this.sync.stop();
  }

  private onSyncNotice(n: SyncNotice): void {
    switch (n.kind) {
      case 'account-updated':
        this.gSnack.info({ title: this.translate.instant('sync.account-updated') });
        break;
      case 'role-removed':
        this.gSnack.warn({
          title: this.translate.instant('sync.role-removed'),
          description: this.translate.instant(n.next ? 'sync.role-switching' : 'sync.role-none'),
        });
        if (!n.next) setTimeout(() => void this.logout(), 1500);   // 11.152 (review m6): không còn vai trò → đăng xuất ĐÚNG đường (thu hồi phiên server)
        break;
      case 'role-policy-blocked':
        // 2026-10-08: vai trò đang dùng bị chính sách đăng nhập chặn lúc này (BE 403 ROLE_POLICY_BLOCKED) — SyncService đã hẹn chuyển sang vai trò dùng
        // được đầu tiên; không còn vai trò nào → báo + đăng xuất đúng đường. review MINOR-5: không tải lại được gói 2 lần liền → đăng xuất, câu riêng.
        this.gSnack.warn(n.next
          ? { title: this.translate.instant('sync.role-policy-blocked') }
          : n.reloadFailed
            ? { title: this.translate.instant('sync.role-policy-reload-failed'), description: this.translate.instant('sync.role-policy-reload-failed-desc') }
            : { title: this.translate.instant('sync.role-policy-none'), description: this.translate.instant('sync.role-policy-none-desc') });
        if (!n.next) setTimeout(() => void this.logout(), 1500);
        break;
      case 'role-policy-redirect':
        // review 2026-10-08 MAJOR-1: guard gặp vai trò bị chính sách chặn (đã tải lại gói, vẫn chặn) và đã chuyển sang vai trò khác — nói rõ vai trò nào, vì sao.
        this.gSnack.warn({
          title: this.translate.instant('sync.role-policy-redirect', { from: n.fromName, to: n.toName }),
          description: n.reason || undefined,
        });
        break;
      case 'catalog-error':
        this.gSnack.warn({ title: this.translate.instant('sync.catalog-error'), description: n.message || undefined });
        break;
      case 'catalog-reloaded':
        this.gSnack.success({
          title: this.translate.instant('sync.catalog-reloaded'),
          description: this.translate.instant('sync.catalog-reloaded-desc', { count: n.count, time: new Date(n.at).toLocaleTimeString('vi-VN') }),
        });
        break;
      case 'forbidden':
        // 11.159: BE 403 có mã → gói tài khoản đã tải lại (quyền đổi thì 'account-updated' đã báo + menu dựng lại); quyền không đổi → chỉ báo
        // thiếu quyền; trang đang mở không còn trong menu của vai trò → về trang đầu vai trò (ở lại thì bấm gì cũng 403).
        if (!n.changed) this.gSnack.warn({ title: this.translate.instant('sync.forbidden') });
        if (!this.roleContext.canOpen(this.router.url)) {
          this.gSnack.info({ title: this.translate.instant('sync.route-closed') });
          void this.router.navigate(['/manage', this.roleContext.currentRoleCodePath]);
        }
        break;
    }
  }

  async logout(): Promise<void> {
    if (this.logoutLoading) return;
    this.logoutLoading = true;
    this.sync.stop();   // 11.150: ngừng theo dõi phiên bản trước khi xóa storage
    try {
      const response = await this.accountService.logout();
      if (response?.status) {
        this.gSnack.success({ title: response.message || this.translate.instant('account-menu.logout-success') });
      } else {
        this.gSnack.warn({ title: response?.message || this.translate.instant('account-menu.logout-server-failed') });
      }
    } catch {
      this.gSnack.warn({
        title: this.translate.instant('account-menu.logout-connect-failed'),
        description: this.translate.instant('account-menu.logout-local-cleared'),
      });
    } finally {
      this.appStorage.removeAccountInfo();
      this.appStorage.removeCategoryData();
      this.roleContext.reset();
      this.logoutLoading = false;
      await this.router.navigate(['/login']);
    }
  }
}

/*
   Tạo các bảng lõi schema [adm] (43 bảng) trong CSDL NGHIỆP VỤ của phần mềm chạy Deployment:Mode=Linked — người dùng / vai trò / quyền ĐỒNG BỘ từ máy chủ SSO (SCIM, mặc định mỗi 5 phút), các bảng còn lại phần mềm TỰ GIỮ.
   Phần mềm: PMS · Dự án: HMS · Lõi nền tảng: 7.0.0 (mô hình EF của đúng bản lõi này).
   FILE NÀY ĐƯỢC SINH bằng scripts/gen-adm-script.cs ở thư mục dự án — ĐỪNG sửa tay; mô hình lõi đổi (nâng bản lõi) thì sinh lại:
       node scripts/gen-adm-script.mjs --app PMS --mode Linked --out <tệp mới>

   Vì sao: D-CORE-93 / D-CORE-94 — phần mềm KHÔNG dùng CSDL lõi riêng. Mỗi phần mềm chỉ có MỘT CSDL nghiệp vụ chứa cả bảng `dbo` (nghiệp vụ) lẫn bảng `adm` này.
   Danh sách bảng của script: ApiPartner, City, Department, DepartmentRole, Log, MessageAttempt, MessageDelivery, MessageProviderProfile, MessageRoute, MessageRouteTarget, MessageTemplate, Nationality, OtpRequest, PartnerEncryptionKey, PasswordHistory, Portal, ProviderWebhookEvent, RefreshToken, Role, RoleAction, RoleActionCustom, RoleClaim, RoleController, RoleDetail, RoleGroup, SchemaVersion, SsoClientSession, SsoSyncState, TrustedDevice, User, UserClaim, UserDeviceToken, UserLogin, UserPasskey, UserPortal, UserRole, UserRoleDepartment, UserSession, UserSettings, UserTableColumnConfig, UserToken, UserTotp, Ward.
   KHÔNG tạo: App · Idp* (chỉ của máy chủ SSO) và mọi bảng mà mô hình EF của lõi không còn dùng.

   ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗
   ║ ⛔ CHỈ CHẠY TRÊN CSDL NGHIỆP VỤ CỦA PHẦN MỀM. KHÔNG chạy trên CSDL của máy chủ SSO.                                       ║
   ║    Script tự TỪ CHỐI nếu thấy adm.IdpSession hoặc adm.App (dấu hiệu CSDL SSO) — dừng 52002, không đổi gì.                  ║
   ║    Phải đặt @ConfirmDb = ĐÚNG tên CSDL đang kết nối, nếu không dừng 52003.                                                 ║
   ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝

   Nhóm: A (CHỈ THÊM — bảng mới; không sửa / xoá / đổi tên bất cứ thứ gì có sẵn). KHÔNG khoá ngoại vật lý (quy ước kho). KHÔNG chèn dữ liệu: bảng bắt đầu rỗng.
   Chạy lặp an toàn: CÓ (idempotent). Bảng ĐÃ CÓ thì bỏ qua HOÀN TOÀN (không thêm cột, không thêm chỉ mục) — ví dụ adm.Log của CSDL đã có dữ liệu thật được GIỮ NGUYÊN. Cuối cùng LUÔN kiểm lại:
          mọi bảng phải có đủ và số cột phải KHỚP mô hình EF; bảng có sẵn mà lệch số cột ⇒ THROW 52009 ⇒ ROLLBACK, không đổi gì (khi đó báo lại, đừng sửa tay bảng có dữ liệu).
   Giao dịch: MỘT giao dịch; lỗi bất kỳ → ROLLBACK (XACT_ABORT ON). Chạy bằng sqlcmd -b để dừng ngay khi lỗi.
   Quyền cần có: CREATE TABLE + CREATE SCHEMA (nếu chưa có schema adm) — vd db_ddladmin. Nếu sau này bật đồng bộ SSO: tài khoản kết nối của API còn cần ALTER trên các bảng identity để bật SET IDENTITY_INSERT (README module SsoClient mục "Quyền CSDL").

   Chạy:  sqlcmd -S <máy chủ> -d <CSDL nghiệp vụ> -U <tài khoản> -b -I -f 65001 -i scripts\sql\2026-11-20_adm-tables-for-app-db.sql   (đường dẫn tính từ thư mục repo phần mềm)
          hoặc mở bằng SSMS (tệp UTF-8 có BOM; nếu chữ tiếng Việt vỡ thì script dừng 52001) — trước đó SỬA @ConfirmDb ở dưới = đúng tên CSDL.
          MẶC ĐỊNH @DryRun = 1: chạy thử — làm hết rồi ROLLBACK, in những gì sẽ tạo. Đọc kết quả, rồi đặt @DryRun = 0 để chạy thật (COMMIT).
   Sau khi chạy thật: .env của phần mềm chỉ đặt MỘT chuỗi ConnectionStrings__OperationalConnection = CSDL này (không còn DefaultConnection, D-CORE-97); Deployment__SsoSync__Mode = DryRun trước, kiểm số đếm ở màn Sức khỏe hệ thống rồi mới Apply.
   Rollback (KHÔNG tự chạy): chỉ DROP TABLE các bảng mà lần chạy THẬT báo "+ đã tạo" (KHÔNG xoá bảng báo "= đã có", vd adm.Log); rồi DELETE FROM adm.SchemaVersion WHERE Script = N'2026-11-20_adm-tables-for-app-db.sql'.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
IF UNICODE(N'ồ') <> 7891 THROW 52001, N'Sai bang ma: chay lai bang sqlcmd -f 65001 -i <file>', 1;
IF OBJECT_ID(N'[adm].[IdpSession]', N'U') IS NOT NULL OR OBJECT_ID(N'[adm].[App]', N'U') IS NOT NULL
    THROW 52002, N'Chạy nhầm CSDL: có adm.IdpSession hoặc adm.App — đây là CSDL của máy chủ SSO. Script này chỉ dành cho CSDL nghiệp vụ của phần mềm. Không có gì bị đổi.', 1;

-- ⚠ BẮT BUỘC SỬA: đặt đúng tên CSDL nghiệp vụ của phần mềm PMS. Để trống / sai tên → dừng, không đổi gì.
DECLARE @ConfirmDb  sysname      = N'';
DECLARE @DryRun     bit          = 1;          -- MẶC ĐỊNH 1 = chạy thử (làm hết rồi ROLLBACK) · duyệt xong đặt 0 = chạy thật (COMMIT)
DECLARE @AppVersion nvarchar(20) = N'0.1.0';   -- ghi sổ adm.SchemaVersion — sửa theo bản phát hành của phần mềm

IF @ConfirmDb = N'' OR DB_NAME() <> @ConfirmDb
    THROW 52003, N'CHƯA XÁC NHẬN CSDL: sửa dòng DECLARE @ConfirmDb = đúng tên CSDL nghiệp vụ đang kết nối (đang kết nối CSDL khác hoặc để trống).', 1;

PRINT N'CSDL: ' + DB_NAME() + CASE WHEN @DryRun = 1 THEN N'  [CHẠY THỬ — sẽ ROLLBACK]' ELSE N'  [CHẠY THẬT]' END;

BEGIN TRAN;

IF SCHEMA_ID(N'adm') IS NULL
BEGIN
    EXEC(N'CREATE SCHEMA [adm]');
    PRINT N'  + đã tạo schema adm';
END

-- ═══════════════ 1. Các bảng (mỗi bảng: chưa có thì tạo cùng chỉ mục; đã có thì GIỮ NGUYÊN) ═══════════════
-- 1. [adm].[ApiPartner]
IF OBJECT_ID(N'[adm].[ApiPartner]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[ApiPartner] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(64) NULL,
        [Name] nvarchar(200) NULL,
        [Enabled] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [DisabledDate] datetime2 NULL,
        CONSTRAINT [PK_ApiPartner] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_ApiPartner_Code] ON [adm].[ApiPartner] ([Code]) WHERE [Code] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[ApiPartner]';
END
ELSE PRINT N'  = [adm].[ApiPartner] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 2. [adm].[City]
IF OBJECT_ID(N'[adm].[City]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[City] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(50) NULL,
        [Name] nvarchar(200) NULL,
        [Note] nvarchar(500) NULL,
        [Status] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_City] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[City]';
END
ELSE PRINT N'  = [adm].[City] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 3. [adm].[Department]
IF OBJECT_ID(N'[adm].[Department]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Department] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(50) NULL,
        [ParentId] int NULL,
        [CityId] int NULL,
        [WardId] int NULL,
        [Name] nvarchar(200) NULL,
        [Type] int NULL,
        [Note] nvarchar(1000) NULL,
        [RoleDescription] nvarchar(200) NULL,
        [Phone] nvarchar(100) NULL,
        [Address] nvarchar(500) NULL,
        [ContactPerson] nvarchar(100) NULL,
        [Email] nvarchar(200) NULL,
        [IsSystem] bit NOT NULL,
        [Status] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_Department] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[Department]';
END
ELSE PRINT N'  = [adm].[Department] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 4. [adm].[DepartmentRole]
IF OBJECT_ID(N'[adm].[DepartmentRole]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[DepartmentRole] (
        [DepartmentId] int NOT NULL,
        [RoleId] int NOT NULL,
        [CreatedUser] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_DepartmentRole] PRIMARY KEY ([DepartmentId], [RoleId])
    );
    CREATE INDEX [IX_DepartmentRole_RoleId] ON [adm].[DepartmentRole] ([RoleId]);
    PRINT N'  + đã tạo [adm].[DepartmentRole]';
END
ELSE PRINT N'  = [adm].[DepartmentRole] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 5. [adm].[Log]
IF OBJECT_ID(N'[adm].[Log]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Log] (
        [Id] int NOT NULL IDENTITY,
        [Action] nvarchar(1000) NULL,
        [Object] nvarchar(100) NULL,
        [ObjectId] nvarchar(64) NULL,
        [ObjectType] nvarchar(100) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [SystemUserId] int NOT NULL,
        [DepartmentId] int NOT NULL,
        [Type] int NOT NULL,
        [Ip] nvarchar(45) NULL,
        [IsSuccess] bit NULL,
        CONSTRAINT [PK_Log] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[Log]';
END
ELSE PRINT N'  = [adm].[Log] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 6. [adm].[MessageAttempt]
IF OBJECT_ID(N'[adm].[MessageAttempt]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageAttempt] (
        [Id] bigint NOT NULL IDENTITY,
        [DeliveryId] uniqueidentifier NOT NULL,
        [ProviderProfileId] int NOT NULL,
        [AttemptNumber] smallint NOT NULL,
        [Status] tinyint NOT NULL,
        [ProviderMessageId] nvarchar(160) NULL,
        [ErrorCode] nvarchar(80) NULL,
        [ErrorMessage] nvarchar(500) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_MessageAttempt] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_MessageAttempt_ProviderProfileId] ON [adm].[MessageAttempt] ([ProviderProfileId]);
    CREATE UNIQUE INDEX [UX_MessageAttempt_Delivery_Attempt] ON [adm].[MessageAttempt] ([DeliveryId], [AttemptNumber]);
    PRINT N'  + đã tạo [adm].[MessageAttempt]';
END
ELSE PRINT N'  = [adm].[MessageAttempt] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 7. [adm].[MessageDelivery]
IF OBJECT_ID(N'[adm].[MessageDelivery]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageDelivery] (
        [Id] uniqueidentifier NOT NULL,
        [Purpose] nvarchar(100) NULL,
        [Channel] tinyint NOT NULL,
        [ProviderProfileId] int NOT NULL,
        [RecipientMasked] nvarchar(320) NULL,
        [SubjectReference] nvarchar(100) NULL,
        [TemplateCode] nvarchar(100) NULL,
        [CorrelationId] nvarchar(100) NULL,
        [IdempotencyKey] nvarchar(100) NULL,
        [Status] tinyint NOT NULL,
        [ProviderMessageId] nvarchar(160) NULL,
        [ErrorCode] nvarchar(80) NULL,
        [ErrorMessage] nvarchar(500) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [SubmittedDate] datetime2 NULL,
        [CompletedDate] datetime2 NULL,
        CONSTRAINT [PK_MessageDelivery] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_MessageDelivery_CreatedDate] ON [adm].[MessageDelivery] ([CreatedDate]);
    CREATE INDEX [IX_MessageDelivery_ProviderProfileId] ON [adm].[MessageDelivery] ([ProviderProfileId]);
    CREATE INDEX [IX_MessageDelivery_Purpose_Status_CreatedDate] ON [adm].[MessageDelivery] ([Purpose], [Status], [CreatedDate]);
    CREATE UNIQUE INDEX [UX_MessageDelivery_IdempotencyKey] ON [adm].[MessageDelivery] ([IdempotencyKey]) WHERE [IdempotencyKey] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[MessageDelivery]';
END
ELSE PRINT N'  = [adm].[MessageDelivery] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 8. [adm].[MessageProviderProfile]
IF OBJECT_ID(N'[adm].[MessageProviderProfile]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageProviderProfile] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(64) NULL,
        [DisplayName] nvarchar(160) NULL,
        [Channel] tinyint NOT NULL,
        [ProviderType] nvarchar(64) NULL,
        [Environment] tinyint NOT NULL,
        [Status] tinyint NOT NULL,
        [NonSecretOptionsJson] nvarchar(max) NULL,
        [SecretRef] nvarchar(64) NULL,
        [EncryptedSecrets] varbinary(max) NULL,
        [SecretsNonce] varbinary(12) NULL,
        [SecretsTag] varbinary(16) NULL,
        [SecretsProtectionVersion] nvarchar(32) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MessageProviderProfile] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_MessageProviderProfile_Code] ON [adm].[MessageProviderProfile] ([Code]) WHERE [Code] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[MessageProviderProfile]';
END
ELSE PRINT N'  = [adm].[MessageProviderProfile] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 9. [adm].[MessageRoute]
IF OBJECT_ID(N'[adm].[MessageRoute]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageRoute] (
        [Id] int NOT NULL IDENTITY,
        [Purpose] nvarchar(100) NULL,
        [Channel] tinyint NOT NULL,
        [Enabled] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MessageRoute] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_MessageRoute_Purpose_Channel] ON [adm].[MessageRoute] ([Purpose], [Channel]) WHERE [Purpose] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[MessageRoute]';
END
ELSE PRINT N'  = [adm].[MessageRoute] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 10. [adm].[MessageRouteTarget]
IF OBJECT_ID(N'[adm].[MessageRouteTarget]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageRouteTarget] (
        [Id] int NOT NULL IDENTITY,
        [RouteId] int NOT NULL,
        [ProviderProfileId] int NOT NULL,
        [Priority] smallint NOT NULL,
        [Enabled] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_MessageRouteTarget] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_MessageRouteTarget_ProviderProfileId] ON [adm].[MessageRouteTarget] ([ProviderProfileId]);
    CREATE UNIQUE INDEX [UX_MessageRouteTarget_Route_Priority] ON [adm].[MessageRouteTarget] ([RouteId], [Priority]);
    CREATE UNIQUE INDEX [UX_MessageRouteTarget_Route_Profile] ON [adm].[MessageRouteTarget] ([RouteId], [ProviderProfileId]);
    PRINT N'  + đã tạo [adm].[MessageRouteTarget]';
END
ELSE PRINT N'  = [adm].[MessageRouteTarget] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 11. [adm].[MessageTemplate]
IF OBJECT_ID(N'[adm].[MessageTemplate]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[MessageTemplate] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(100) NULL,
        [Channel] tinyint NOT NULL,
        [Locale] nvarchar(16) NULL,
        [Subject] nvarchar(300) NULL,
        [Body] nvarchar(max) NULL,
        [VariablesSchemaJson] nvarchar(max) NULL,
        [Version] int NOT NULL,
        [IsActive] bit NOT NULL,
        [IsSystem] bit NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [RowVersion] rowversion NOT NULL,
        CONSTRAINT [PK_MessageTemplate] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_MessageTemplate_Code_Channel_Locale_Version] ON [adm].[MessageTemplate] ([Code], [Channel], [Locale], [Version]) WHERE [Code] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[MessageTemplate]';
END
ELSE PRINT N'  = [adm].[MessageTemplate] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 12. [adm].[Nationality]
IF OBJECT_ID(N'[adm].[Nationality]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Nationality] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(50) NULL,
        [Name] nvarchar(200) NULL,
        [Language] nvarchar(10) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [Currency] nvarchar(20) NULL,
        [Exchange] decimal(15,0) NULL,
        [PrefixPhone] nvarchar(10) NULL,
        [IsUseCurrency] bit NOT NULL,
        [IsMainCurrency] bit NOT NULL,
        [MiniFlagPath] nvarchar(200) NULL,
        [FlagPath] nvarchar(200) NULL,
        [Status] bit NOT NULL,
        CONSTRAINT [PK_Nationality] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[Nationality]';
END
ELSE PRINT N'  = [adm].[Nationality] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 13. [adm].[OtpRequest]
IF OBJECT_ID(N'[adm].[OtpRequest]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[OtpRequest] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [Purpose] tinyint NOT NULL,
        [CodeHash] nvarchar(64) NULL,
        [CodeSalt] nvarchar(32) NULL,
        [Channel] nvarchar(20) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [IsUsed] bit NOT NULL,
        [VerifyAttempts] int NOT NULL,
        [DeliveryStatus] nvarchar(24) NULL,
        [DeliveryId] uniqueidentifier NULL,
        [DeliveryErrorCode] nvarchar(80) NULL,
        CONSTRAINT [PK_OtpRequest] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_OtpRequest_UserId_Purpose_CreatedDate] ON [adm].[OtpRequest] ([UserId], [Purpose], [CreatedDate]);
    PRINT N'  + đã tạo [adm].[OtpRequest]';
END
ELSE PRINT N'  = [adm].[OtpRequest] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 14. [adm].[PartnerEncryptionKey]
IF OBJECT_ID(N'[adm].[PartnerEncryptionKey]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[PartnerEncryptionKey] (
        [Id] int NOT NULL IDENTITY,
        [PartnerId] int NOT NULL,
        [Kid] nvarchar(100) NULL,
        [PublicKeySpkiB64] nvarchar(max) NULL,
        [EncryptedPrivateKey] varbinary(max) NOT NULL,
        [EncryptionNonce] varbinary(12) NOT NULL,
        [EncryptionTag] varbinary(16) NOT NULL,
        [ProtectionVersion] nvarchar(32) NULL,
        [Status] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [ActivatedDate] datetime2 NOT NULL,
        [RetireAfterDate] datetime2 NULL,
        [RevokedDate] datetime2 NULL,
        CONSTRAINT [PK_PartnerEncryptionKey] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_PartnerEncryptionKey_PartnerId_Status] ON [adm].[PartnerEncryptionKey] ([PartnerId], [Status]);
    CREATE UNIQUE INDEX [UX_PartnerEncryptionKey_Kid] ON [adm].[PartnerEncryptionKey] ([Kid]) WHERE [Kid] IS NOT NULL;
    CREATE UNIQUE INDEX [UX_PartnerEncryptionKey_OneActivePerPartner] ON [adm].[PartnerEncryptionKey] ([PartnerId]) WHERE [Status] = 1 AND [RevokedDate] IS NULL;
    PRINT N'  + đã tạo [adm].[PartnerEncryptionKey]';
END
ELSE PRINT N'  = [adm].[PartnerEncryptionKey] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 15. [adm].[PasswordHistory]
IF OBJECT_ID(N'[adm].[PasswordHistory]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[PasswordHistory] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [PasswordHash] nvarchar(400) NULL,
        [CreatedDate] datetime2 NOT NULL,
        CONSTRAINT [PK_PasswordHistory] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_PasswordHistory_UserId_CreatedDate] ON [adm].[PasswordHistory] ([UserId], [CreatedDate]);
    PRINT N'  + đã tạo [adm].[PasswordHistory]';
END
ELSE PRINT N'  = [adm].[PasswordHistory] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 16. [adm].[Portal]
IF OBJECT_ID(N'[adm].[Portal]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Portal] (
        [Id] int NOT NULL,
        [Name] nvarchar(250) NULL,
        [Domains] nvarchar(250) NULL,
        CONSTRAINT [PK_Portal] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[Portal]';
END
ELSE PRINT N'  = [adm].[Portal] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 17. [adm].[ProviderWebhookEvent]
IF OBJECT_ID(N'[adm].[ProviderWebhookEvent]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[ProviderWebhookEvent] (
        [Id] bigint NOT NULL IDENTITY,
        [ProviderProfileId] int NOT NULL,
        [ProviderEventId] nvarchar(160) NULL,
        [PayloadHash] nvarchar(64) NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [ErrorMessage] nvarchar(500) NULL,
        CONSTRAINT [PK_ProviderWebhookEvent] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_ProviderWebhookEvent_Profile_Event] ON [adm].[ProviderWebhookEvent] ([ProviderProfileId], [ProviderEventId]) WHERE [ProviderEventId] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[ProviderWebhookEvent]';
END
ELSE PRINT N'  = [adm].[ProviderWebhookEvent] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 18. [adm].[RefreshToken]
IF OBJECT_ID(N'[adm].[RefreshToken]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RefreshToken] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [SessionId] int NOT NULL,
        [TokenHash] varchar(64) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [AbsoluteExpiresAt] datetime2 NOT NULL,
        [UsedAt] datetime2 NULL,
        [ReplacedById] int NULL,
        [RevokedAt] datetime2 NULL,
        [RevokedReason] nvarchar(200) NULL,
        [DeviceHash] varchar(64) NULL,
        [IpCreated] varchar(45) NULL,
        [RememberMe] bit NOT NULL,
        CONSTRAINT [PK_RefreshToken] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_RefreshToken_SessionId] ON [adm].[RefreshToken] ([SessionId]);
    CREATE INDEX [IX_RefreshToken_UserId_ExpiresAt] ON [adm].[RefreshToken] ([UserId], [ExpiresAt]);
    CREATE UNIQUE INDEX [UX_RefreshToken_TokenHash] ON [adm].[RefreshToken] ([TokenHash]) WHERE [TokenHash] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[RefreshToken]';
END
ELSE PRINT N'  = [adm].[RefreshToken] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 19. [adm].[Role]
IF OBJECT_ID(N'[adm].[Role]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Role] (
        [Id] int NOT NULL IDENTITY,
        [Code] nvarchar(50) NULL,
        [Icon] nvarchar(50) NULL,
        [Description] nvarchar(max) NULL,
        [Type] int NOT NULL,
        [NameExtension] nvarchar(100) NULL,
        [CreatedUser] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [UpdatedUser] int NULL,
        [UpdatedDate] datetime2 NULL,
        [IsSystem] bit NOT NULL,
        [Name] nvarchar(256) NULL,
        [NormalizedName] nvarchar(256) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        CONSTRAINT [PK_Role] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_Role_NormalizedName_NameExtension] ON [adm].[Role] ([NormalizedName], [NameExtension]) WHERE [NormalizedName] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[Role]';
END
ELSE PRINT N'  = [adm].[Role] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 20. [adm].[RoleAction]
IF OBJECT_ID(N'[adm].[RoleAction]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleAction] (
        [Id] int NOT NULL IDENTITY,
        [ControllerId] nvarchar(450) NULL,
        [Name] nvarchar(100) NULL,
        [ActionName] nvarchar(500) NULL,
        [Description] nvarchar(max) NULL,
        [Order] int NOT NULL,
        [IsShow] bit NOT NULL,
        [HashRole] nvarchar(100) NULL,
        CONSTRAINT [PK_RoleAction] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_RoleAction_ControllerId] ON [adm].[RoleAction] ([ControllerId]);
    PRINT N'  + đã tạo [adm].[RoleAction]';
END
ELSE PRINT N'  = [adm].[RoleAction] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 21. [adm].[RoleActionCustom]
IF OBJECT_ID(N'[adm].[RoleActionCustom]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleActionCustom] (
        [UserId] int NOT NULL,
        [DepartmentId] int NOT NULL,
        [RoleId] int NOT NULL,
        [ActionId] int NOT NULL,
        CONSTRAINT [PK_RoleActionCustom] PRIMARY KEY ([UserId], [ActionId], [DepartmentId], [RoleId])
    );
    PRINT N'  + đã tạo [adm].[RoleActionCustom]';
END
ELSE PRINT N'  = [adm].[RoleActionCustom] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 22. [adm].[RoleClaim]
IF OBJECT_ID(N'[adm].[RoleClaim]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleClaim] (
        [Id] int NOT NULL IDENTITY,
        [RoleId] int NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_RoleClaim] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_RoleClaim_RoleId] ON [adm].[RoleClaim] ([RoleId]);
    PRINT N'  + đã tạo [adm].[RoleClaim]';
END
ELSE PRINT N'  = [adm].[RoleClaim] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 23. [adm].[RoleController]
IF OBJECT_ID(N'[adm].[RoleController]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleController] (
        [Id] nvarchar(450) NOT NULL,
        [GroupId] int NOT NULL,
        [Name] nvarchar(200) NULL,
        [Description] nvarchar(1000) NULL,
        [Order] int NOT NULL,
        [IsShow] bit NOT NULL,
        [Href] nvarchar(1000) NULL,
        [Icon] nvarchar(200) NULL,
        [RouterLink] nvarchar(1000) NULL,
        [CreatedUser] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [UpdatedUser] int NULL,
        [UpdatedDate] datetime2 NULL,
        CONSTRAINT [PK_RoleController] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[RoleController]';
END
ELSE PRINT N'  = [adm].[RoleController] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 24. [adm].[RoleDetail]
IF OBJECT_ID(N'[adm].[RoleDetail]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleDetail] (
        [RoleId] int NOT NULL,
        [ActionId] int NOT NULL,
        CONSTRAINT [PK_RoleDetail] PRIMARY KEY ([ActionId], [RoleId])
    );
    CREATE INDEX [IX_RoleDetail_RoleId] ON [adm].[RoleDetail] ([RoleId]);
    PRINT N'  + đã tạo [adm].[RoleDetail]';
END
ELSE PRINT N'  = [adm].[RoleDetail] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 25. [adm].[RoleGroup]
IF OBJECT_ID(N'[adm].[RoleGroup]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[RoleGroup] (
        [Id] int NOT NULL IDENTITY,
        [Name] nvarchar(200) NULL,
        [Icon] nvarchar(200) NULL,
        [Description] nvarchar(1000) NULL,
        [Order] int NOT NULL,
        [IsShow] bit NOT NULL,
        [ParentId] int NOT NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_RoleGroup] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[RoleGroup]';
END
ELSE PRINT N'  = [adm].[RoleGroup] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 26. [adm].[SchemaVersion]
IF OBJECT_ID(N'[adm].[SchemaVersion]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[SchemaVersion]
    (
        [Script]        nvarchar(200) NOT NULL CONSTRAINT [PK_SchemaVersion] PRIMARY KEY,
        [AppVersion]    nvarchar(20)  NOT NULL,
        [AppliedAt]     datetime2(7)  NOT NULL,
        [LastAppliedAt] datetime2(7)  NOT NULL,
        [RunCount]      int           NOT NULL CONSTRAINT [DF_SchemaVersion_RunCount] DEFAULT (1),
        [AppliedBy]     nvarchar(128) NULL,
        [HostName]      nvarchar(128) NULL
    );
    PRINT N'  + đã tạo [adm].[SchemaVersion]';
END
ELSE PRINT N'  = [adm].[SchemaVersion] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 27. [adm].[SsoClientSession]
IF OBJECT_ID(N'[adm].[SsoClientSession]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[SsoClientSession] (
        [Id] bigint NOT NULL IDENTITY,
        [SessionId] int NOT NULL,
        [UserId] int NOT NULL,
        [Sid] nvarchar(64) NOT NULL,
        [IdTokenExpiresAtUnix] bigint NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [RevokedAt] datetime2 NULL,
        [IdTokenHintEnc] varbinary(2048) NULL,
        CONSTRAINT [PK_SsoClientSession] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_SsoClientSession_SessionId] ON [adm].[SsoClientSession] ([SessionId]);
    CREATE INDEX [IX_SsoClientSession_Sid] ON [adm].[SsoClientSession] ([Sid]);
    CREATE INDEX [IX_SsoClientSession_UserId] ON [adm].[SsoClientSession] ([UserId]);
    PRINT N'  + đã tạo [adm].[SsoClientSession]';
END
ELSE PRINT N'  = [adm].[SsoClientSession] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 28. [adm].[SsoSyncState]
IF OBJECT_ID(N'[adm].[SsoSyncState]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[SsoSyncState] (
        [GroupKey] nvarchar(32) NOT NULL,
        [LastAttemptAt] datetime2 NULL,
        [LastSuccessAt] datetime2 NULL,
        [LastOk] bit NULL,
        [LastMode] nvarchar(10) NULL,
        [LastMessage] nvarchar(400) NULL,
        [LastCountsJson] nvarchar(2000) NULL,
        [LastDurationMs] int NULL,
        [ConsecutiveFailures] int NOT NULL,
        [ConflictCount] int NOT NULL,
        [LeaseOwner] nvarchar(64) NULL,
        [LeaseUntil] datetime2 NULL,
        [UpdatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_SsoSyncState] PRIMARY KEY ([GroupKey])
    );
    PRINT N'  + đã tạo [adm].[SsoSyncState]';
END
ELSE PRINT N'  = [adm].[SsoSyncState] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 29. [adm].[TrustedDevice]
IF OBJECT_ID(N'[adm].[TrustedDevice]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[TrustedDevice] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [TokenHash] varchar(64) NULL,
        [DeviceName] nvarchar(120) NULL,
        [UserAgentHash] varchar(64) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [LastUsedAt] datetime2 NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [RevokedAt] datetime2 NULL,
        [RevokedReason] nvarchar(200) NULL,
        CONSTRAINT [PK_TrustedDevice] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_TrustedDevice_UserId_ExpiresAt] ON [adm].[TrustedDevice] ([UserId], [ExpiresAt]);
    CREATE UNIQUE INDEX [UX_TrustedDevice_TokenHash] ON [adm].[TrustedDevice] ([TokenHash]) WHERE [TokenHash] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[TrustedDevice]';
END
ELSE PRINT N'  = [adm].[TrustedDevice] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 30. [adm].[User]
IF OBJECT_ID(N'[adm].[User]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[User] (
        [Id] int NOT NULL IDENTITY,
        [Avatar] nvarchar(max) NULL,
        [DisplayName] nvarchar(100) NULL,
        [IsLock] bit NOT NULL,
        [NoteLock] nvarchar(1000) NULL,
        [Note] nvarchar(1000) NULL,
        [CreatedUser] int NULL,
        [IsSuperAdmin] bit NOT NULL,
        [CreatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        [UpdatedDate] datetime2 NULL,
        [MustChangePassword] bit NOT NULL,
        [LastLoginSuccessDate] datetime2 NULL,
        [FailedLoginCountToday] int NOT NULL,
        [LastFailedLoginDate] datetime2 NULL,
        [IsChangePassword] bit NOT NULL,
        [LastChangePasswordDate] datetime2 NULL,
        [IsMultiDevice] bit NOT NULL,
        [GuidId] nvarchar(100) NULL,
        [HashToken] nvarchar(max) NULL,
        [UserName] nvarchar(256) NULL,
        [NormalizedUserName] nvarchar(256) NULL,
        [Email] nvarchar(256) NULL,
        [NormalizedEmail] nvarchar(256) NULL,
        [EmailConfirmed] bit NOT NULL,
        [PasswordHash] nvarchar(max) NULL,
        [SecurityStamp] nvarchar(max) NULL,
        [ConcurrencyStamp] nvarchar(max) NULL,
        [PhoneNumber] nvarchar(max) NULL,
        [PhoneNumberConfirmed] bit NOT NULL,
        [TwoFactorEnabled] bit NOT NULL,
        [LockoutEnd] datetimeoffset NULL,
        [LockoutEnabled] bit NOT NULL,
        [AccessFailedCount] int NOT NULL,
        CONSTRAINT [PK_User] PRIMARY KEY ([Id])
    );
    CREATE INDEX [EmailIndex] ON [adm].[User] ([NormalizedEmail]);
    CREATE UNIQUE INDEX [UserNameIndex] ON [adm].[User] ([NormalizedUserName]) WHERE [NormalizedUserName] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[User]';
END
ELSE PRINT N'  = [adm].[User] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 31. [adm].[UserClaim]
IF OBJECT_ID(N'[adm].[UserClaim]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserClaim] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [ClaimType] nvarchar(max) NULL,
        [ClaimValue] nvarchar(max) NULL,
        CONSTRAINT [PK_UserClaim] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_UserClaim_UserId] ON [adm].[UserClaim] ([UserId]);
    PRINT N'  + đã tạo [adm].[UserClaim]';
END
ELSE PRINT N'  = [adm].[UserClaim] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 32. [adm].[UserDeviceToken]
IF OBJECT_ID(N'[adm].[UserDeviceToken]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserDeviceToken] (
        [UserId] int NOT NULL,
        [DeviceCode] nvarchar(50) NOT NULL,
        [DeviceType] tinyint NOT NULL,
        [DeviceInfo] nvarchar(200) NULL,
        [HashToken] nvarchar(200) NULL,
        [ExpirationDate] datetime2 NULL,
        CONSTRAINT [PK_UserDeviceToken] PRIMARY KEY ([UserId], [DeviceCode])
    );
    PRINT N'  + đã tạo [adm].[UserDeviceToken]';
END
ELSE PRINT N'  = [adm].[UserDeviceToken] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 33. [adm].[UserLogin]
IF OBJECT_ID(N'[adm].[UserLogin]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserLogin] (
        [LoginProvider] nvarchar(450) NOT NULL,
        [ProviderKey] nvarchar(450) NOT NULL,
        [ProviderDisplayName] nvarchar(max) NULL,
        [UserId] int NOT NULL,
        CONSTRAINT [PK_UserLogin] PRIMARY KEY ([LoginProvider], [ProviderKey])
    );
    CREATE INDEX [IX_UserLogin_UserId] ON [adm].[UserLogin] ([UserId]);
    PRINT N'  + đã tạo [adm].[UserLogin]';
END
ELSE PRINT N'  = [adm].[UserLogin] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 34. [adm].[UserPasskey]
IF OBJECT_ID(N'[adm].[UserPasskey]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserPasskey] (
        [CredentialId] varbinary(1024) NOT NULL,
        [UserId] int NOT NULL,
        [Data] nvarchar(max) NOT NULL,
        CONSTRAINT [PK_UserPasskey] PRIMARY KEY ([CredentialId])
    );
    CREATE INDEX [IX_UserPasskey_UserId] ON [adm].[UserPasskey] ([UserId]);
    PRINT N'  + đã tạo [adm].[UserPasskey]';
END
ELSE PRINT N'  = [adm].[UserPasskey] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 35. [adm].[UserPortal]
IF OBJECT_ID(N'[adm].[UserPortal]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserPortal] (
        [UserId] int NOT NULL,
        [DepartmentId] int NOT NULL,
        [RoleId] int NOT NULL,
        [PortalId] int NOT NULL,
        CONSTRAINT [PK_UserPortal] PRIMARY KEY ([UserId], [DepartmentId], [PortalId], [RoleId])
    );
    PRINT N'  + đã tạo [adm].[UserPortal]';
END
ELSE PRINT N'  = [adm].[UserPortal] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 36. [adm].[UserRole]
IF OBJECT_ID(N'[adm].[UserRole]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserRole] (
        [UserId] int NOT NULL,
        [RoleId] int NOT NULL,
        CONSTRAINT [PK_UserRole] PRIMARY KEY ([UserId], [RoleId])
    );
    CREATE INDEX [IX_UserRole_RoleId] ON [adm].[UserRole] ([RoleId]);
    PRINT N'  + đã tạo [adm].[UserRole]';
END
ELSE PRINT N'  = [adm].[UserRole] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 37. [adm].[UserRoleDepartment]
IF OBJECT_ID(N'[adm].[UserRoleDepartment]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserRoleDepartment] (
        [UserId] int NOT NULL,
        [RoleId] int NOT NULL,
        [DepartmentId] int NOT NULL,
        CONSTRAINT [PK_UserRoleDepartment] PRIMARY KEY ([UserId], [RoleId], [DepartmentId])
    );
    PRINT N'  + đã tạo [adm].[UserRoleDepartment]';
END
ELSE PRINT N'  = [adm].[UserRoleDepartment] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 38. [adm].[UserSession]
IF OBJECT_ID(N'[adm].[UserSession]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserSession] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [JwtId] varchar(36) NULL,
        [TokenHash] varchar(64) NULL,
        [CreatedAt] datetime2 NOT NULL,
        [LastActivityAt] datetime2 NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [RevokedAt] datetime2 NULL,
        [RevokedReason] nvarchar(200) NULL,
        [PrevJwtId] varchar(36) NULL,
        [PrevTokenHash] varchar(64) NULL,
        CONSTRAINT [PK_UserSession] PRIMARY KEY ([Id])
    );
    CREATE INDEX [IX_UserSession_PrevJwtId] ON [adm].[UserSession] ([PrevJwtId]);
    CREATE INDEX [IX_UserSession_UserId_ExpiresAt] ON [adm].[UserSession] ([UserId], [ExpiresAt]);
    CREATE UNIQUE INDEX [UX_UserSession_JwtId] ON [adm].[UserSession] ([JwtId]) WHERE [JwtId] IS NOT NULL;
    PRINT N'  + đã tạo [adm].[UserSession]';
END
ELSE PRINT N'  = [adm].[UserSession] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 39. [adm].[UserSettings]
IF OBJECT_ID(N'[adm].[UserSettings]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserSettings] (
        [UserId] int NOT NULL,
        [IsEditPrice] bit NOT NULL,
        [IsEditPOSPrice] bit NOT NULL,
        CONSTRAINT [PK_UserSettings] PRIMARY KEY ([UserId])
    );
    PRINT N'  + đã tạo [adm].[UserSettings]';
END
ELSE PRINT N'  = [adm].[UserSettings] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 40. [adm].[UserTableColumnConfig]
IF OBJECT_ID(N'[adm].[UserTableColumnConfig]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserTableColumnConfig] (
        [RoleControllerId] nvarchar(450) NOT NULL,
        [UserId] int NOT NULL,
        [DefaultSettings] nvarchar(max) NULL,
        CONSTRAINT [PK_UserTableColumnConfig] PRIMARY KEY ([UserId], [RoleControllerId])
    );
    PRINT N'  + đã tạo [adm].[UserTableColumnConfig]';
END
ELSE PRINT N'  = [adm].[UserTableColumnConfig] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 41. [adm].[UserToken]
IF OBJECT_ID(N'[adm].[UserToken]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserToken] (
        [UserId] int NOT NULL,
        [LoginProvider] nvarchar(450) NOT NULL,
        [Name] nvarchar(450) NOT NULL,
        [Value] nvarchar(max) NULL,
        CONSTRAINT [PK_UserToken] PRIMARY KEY ([UserId], [LoginProvider], [Name])
    );
    PRINT N'  + đã tạo [adm].[UserToken]';
END
ELSE PRINT N'  = [adm].[UserToken] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 42. [adm].[UserTotp]
IF OBJECT_ID(N'[adm].[UserTotp]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[UserTotp] (
        [Id] int NOT NULL IDENTITY,
        [UserId] int NOT NULL,
        [SecretProtected] nvarchar(max) NULL,
        [Enabled] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [ConfirmedAt] datetime2 NULL,
        [LastUsedStep] bigint NOT NULL,
        [BackupCodeHashes] nvarchar(max) NULL,
        [LastUsedAt] datetime2 NULL,
        [Note] nvarchar(200) NULL,
        CONSTRAINT [PK_UserTotp] PRIMARY KEY ([Id])
    );
    CREATE UNIQUE INDEX [UX_UserTotp_UserId] ON [adm].[UserTotp] ([UserId]);
    PRINT N'  + đã tạo [adm].[UserTotp]';
END
ELSE PRINT N'  = [adm].[UserTotp] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- 43. [adm].[Ward]
IF OBJECT_ID(N'[adm].[Ward]', N'U') IS NULL
BEGIN
    CREATE TABLE [adm].[Ward] (
        [Id] int NOT NULL IDENTITY,
        [CityId] int NOT NULL,
        [Code] nvarchar(50) NULL,
        [Name] nvarchar(200) NULL,
        [Note] nvarchar(500) NULL,
        [Status] bit NULL,
        [CreatedDate] datetime2 NOT NULL,
        [CreatedUser] int NOT NULL,
        [UpdatedDate] datetime2 NULL,
        [UpdatedUser] int NULL,
        CONSTRAINT [PK_Ward] PRIMARY KEY ([Id])
    );
    PRINT N'  + đã tạo [adm].[Ward]';
END
ELSE PRINT N'  = [adm].[Ward] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';

-- ═══════════════ 2. Kiểm lại hình dạng cuối (đủ bảng, số cột khớp mô hình EF, không khoá ngoại vật lý) ═══════════════
DECLARE @Bad nvarchar(max) = N'';
DECLARE @Expect TABLE (TableName sysname NOT NULL, ColCount int NOT NULL);
INSERT @Expect (TableName, ColCount) VALUES
    (N'ApiPartner', 9),
    (N'City', 9),
    (N'Department', 19),
    (N'DepartmentRole', 4),
    (N'Log', 11),
    (N'MessageAttempt', 12),
    (N'MessageDelivery', 19),
    (N'MessageProviderProfile', 18),
    (N'MessageRoute', 9),
    (N'MessageRouteTarget', 9),
    (N'MessageTemplate', 15),
    (N'Nationality', 16),
    (N'OtpRequest', 13),
    (N'PartnerEncryptionKey', 16),
    (N'PasswordHistory', 4),
    (N'Portal', 3),
    (N'ProviderWebhookEvent', 9),
    (N'RefreshToken', 14),
    (N'Role', 14),
    (N'RoleAction', 8),
    (N'RoleActionCustom', 4),
    (N'RoleClaim', 4),
    (N'RoleController', 13),
    (N'RoleDetail', 2),
    (N'RoleGroup', 11),
    (N'SchemaVersion', 7),
    (N'SsoClientSession', 8),
    (N'SsoSyncState', 13),
    (N'TrustedDevice', 10),
    (N'User', 34),
    (N'UserClaim', 4),
    (N'UserDeviceToken', 6),
    (N'UserLogin', 4),
    (N'UserPasskey', 3),
    (N'UserPortal', 4),
    (N'UserRole', 2),
    (N'UserRoleDepartment', 3),
    (N'UserSession', 11),
    (N'UserSettings', 3),
    (N'UserTableColumnConfig', 3),
    (N'UserToken', 4),
    (N'UserTotp', 10),
    (N'Ward', 10);

SELECT @Bad += N' thiếu bảng ' + e.TableName + N';'
FROM @Expect e
WHERE OBJECT_ID(N'[adm].[' + e.TableName + N']', N'U') IS NULL;

SELECT @Bad += N' bảng ' + e.TableName + N' có ' + CAST(c.n AS nvarchar(10)) + N' cột (mô hình EF: ' + CAST(e.ColCount AS nvarchar(10)) + N');'
FROM @Expect e
CROSS APPLY (SELECT COUNT(*) AS n FROM sys.columns WHERE object_id = OBJECT_ID(N'[adm].[' + e.TableName + N']')) c
WHERE OBJECT_ID(N'[adm].[' + e.TableName + N']', N'U') IS NOT NULL AND c.n <> e.ColCount;

SELECT @Bad += N' khoá ngoại vật lý ' + fk.name + N' ở ' + OBJECT_NAME(fk.parent_object_id) + N' (quy ước kho cấm);'
FROM sys.foreign_keys fk
WHERE fk.parent_object_id IN (SELECT OBJECT_ID(N'[adm].[' + e2.TableName + N']') FROM @Expect e2 WHERE OBJECT_ID(N'[adm].[' + e2.TableName + N']', N'U') IS NOT NULL);

IF @Bad <> N''
BEGIN
    SET @Bad = LEFT(N'Kiểm lại hình dạng cuối THẤT BẠI — lệch / thiếu:' + @Bad + N' (đã ROLLBACK; bảng đã có từ trước nhưng khác mô hình cần xử lý riêng, đừng sửa tay bảng có dữ liệu).', 1900);
    THROW 52009, @Bad, 1;
END
PRINT N'2. Kiểm lại hình dạng cuối: đạt (43 bảng, số cột khớp mô hình EF, không khoá ngoại vật lý)';

IF @DryRun = 1
BEGIN
    ROLLBACK TRAN;
    PRINT N'>>> CHẠY THỬ (@DryRun = 1): đã ROLLBACK, CSDL KHÔNG đổi. Duyệt các dòng "+ đã tạo" / "= đã có" ở trên rồi đặt @DryRun = 0 để chạy thật.';
END
ELSE
BEGIN
    COMMIT TRAN;
    PRINT N'>>> ĐÃ CHẠY THẬT (COMMIT). Bước tiếp: bật đồng bộ SSO ở chế độ DryRun.';
END

-- ── Ghi sổ — NGOÀI giao dịch; chỉ khi chạy thật; thời gian = giờ Việt Nam ──
IF @DryRun = 0 AND OBJECT_ID(N'[adm].[SchemaVersion]', N'U') IS NOT NULL
BEGIN
    UPDATE [adm].[SchemaVersion] SET LastAppliedAt = DATEADD(HOUR, 7, SYSUTCDATETIME()), RunCount = RunCount + 1, AppliedBy = SUSER_SNAME(), HostName = HOST_NAME()
    WHERE Script = N'2026-11-20_adm-tables-for-app-db.sql';
    IF @@ROWCOUNT = 0
        INSERT INTO [adm].[SchemaVersion] (Script, AppVersion, AppliedAt, LastAppliedAt)
        VALUES (N'2026-11-20_adm-tables-for-app-db.sql', @AppVersion, DATEADD(HOUR, 7, SYSUTCDATETIME()), DATEADD(HOUR, 7, SYSUTCDATETIME()));
END
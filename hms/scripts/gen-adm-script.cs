#:sdk Microsoft.NET.Sdk.Web
#:property CoreRoot=$(PLATFORM_ROOT)
#:project $(CoreRoot)/src/Core/Host/PTCore.Host/PTCore.Host.csproj
#:project $(CoreRoot)/src/Core/Modules/PTCore.Modules.SsoClient/PTCore.Modules.SsoClient.csproj
#:property PublishAot=false

// gen-adm-script.cs — SINH script SQL tạo các bảng lõi schema `adm` trong CSDL NGHIỆP VỤ của MỘT phần mềm (D-CORE-93 / D-CORE-94: phần mềm không dùng CSDL lõi riêng; bảng người dùng / vai trò / quyền /
// nhật ký… nằm ngay trong CSDL nghiệp vụ, cạnh các bảng `dbo`). Công cụ DEV, ứng dụng .NET MỘT TỆP (`dotnet run <tệp>.cs`): KHÔNG csproj, KHÔNG gói NuGet. KHÔNG nối CSDL nào, KHÔNG chạy SQL.
//
// Nguồn sự thật = MÔ HÌNH EF của CoreDbContext của ĐÚNG BẢN LÕI đang trỏ tới (biến PLATFORM_ROOT) ở chế độ triển khai của phần mềm:
//   • Linked     — CoreDbContext + cấu hình thực thể module SsoClient (thêm adm.SsoClientSession, adm.SsoSyncState): người dùng / vai trò / quyền ĐỒNG BỘ từ máy chủ SSO.
//   • Standalone — CoreDbContext thuần: phần mềm tự quản trị tài khoản / phân quyền ngay trong CSDL nghiệp vụ, không có hai bảng SsoClient.
// Lõi mỗi dự án có thể ở một bản khác nhau ⇒ script được SINH THEO MÔ HÌNH CỦA BẢN LÕI ĐÓ và ghi số phiên bản lõi vào đầu tệp. Lõi đổi (nâng MINOR) ⇒ sinh lại bằng cùng lệnh, rồi so với script cũ.
//
// Cách chạy KHUYÊN DÙNG (ở thư mục DỰ ÁN — wrapper tự tìm lõi qua workspace.json và đặt PLATFORM_ROOT):
//   node scripts/gen-adm-script.mjs --app <Mã> [--mode Linked|Standalone] [--out <tệp .sql>]
// Chạy trực tiếp: đặt PLATFORM_ROOT = thư mục lõi, rồi
//   dotnet run scripts/gen-adm-script.cs -- --mode Linked --out <đường dẫn TUYỆT ĐỐI tệp .sql> --app <Mã> --project "<Tên dự án>" --app-version 0.1.0 --core-version 7.0.0
// Mã thoát: 0 = đã ghi tệp · 2 = sai tham số / mô hình không đúng chế độ · 3 = EF sinh ra câu lệnh công cụ chưa biết xử lý (dừng, không ghi tệp — sửa công cụ).
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PTCore.Application;
using PTCore.Host.Persistence;

Console.OutputEncoding = Encoding.UTF8;

// ── đối số: --khoá giá trị (không dùng thư viện ngoài) ──
var opt = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
for (var i = 0; i < args.Length; i++)
{
    if (!args[i].StartsWith("--", StringComparison.Ordinal) || i + 1 >= args.Length) { Console.Error.WriteLine("Đối số lạ hoặc thiếu giá trị: " + args[i]); return 2; }
    opt[args[i][2..]] = args[++i];
}

// Đường dẫn PHẢI tuyệt đối: `dotnet run <tệp>.cs` đặt thư mục làm việc = thư mục chứa tệp .cs (không phải nơi gõ lệnh) nên đường tương đối ghi lệch chỗ.
if (!opt.TryGetValue("out", out var outArg) || !outArg.EndsWith(".sql", StringComparison.OrdinalIgnoreCase) || !Path.IsPathRooted(outArg))
{
    Console.Error.WriteLine("Cách dùng: node scripts/gen-adm-script.mjs --app <Mã> [--mode Linked|Standalone]  (hoặc dotnet run … -- --out <đường dẫn TUYỆT ĐỐI>.sql --mode … --app … --project … --app-version … --core-version …)");
    return 2;
}
var modeText = opt.GetValueOrDefault("mode", "Linked");
if (!modeText.Equals("Linked", StringComparison.OrdinalIgnoreCase) && !modeText.Equals("Standalone", StringComparison.OrdinalIgnoreCase)) { Console.Error.WriteLine("--mode chỉ nhận Linked hoặc Standalone."); return 2; }
var linked = modeText.Equals("Linked", StringComparison.OrdinalIgnoreCase);
var appCode = opt.GetValueOrDefault("app", "<Mã phần mềm>");
var projectName = opt.GetValueOrDefault("project", "<Tên dự án>");
var appVersion = opt.GetValueOrDefault("app-version", "0.1.0");
var coreVersion = opt.GetValueOrDefault("core-version", "(không rõ)");

var outPath = Path.GetFullPath(outArg);
var scriptName = Path.GetFileName(outPath);

// ── dựng context: CHỈ để lấy mô hình EF (chuỗi kết nối giả, không bao giờ mở) ──
var model = linked ? DeploymentMode.Linked : DeploymentMode.Standalone;
var options = new DbContextOptionsBuilder<CoreDbContext>()
    .UseSqlServer("Server=.;Database=ZZ_KHONG_NOI_GEN_SCRIPT;Trusted_Connection=True;TrustServerCertificate=True")
    .UseDeploymentModel(model)
    .Options;
using CoreDbContext context = linked ? new LinkedCoreContext(options) : new StandaloneCoreContext(options);
if (context.DeploymentModel != model)
{
    Console.Error.WriteLine($"Chế độ mô hình EF ({context.DeploymentModel}) KHÁC yêu cầu ({model}) — dừng.");
    return 2;
}

var raw = context.Database.GenerateCreateScript();

// ── tách theo lô (EF ngăn lô bằng dòng "GO") rồi gom theo bảng ──
var batches = Regex.Split(raw, @"^GO\s*$", RegexOptions.Multiline).Select(b => b.Trim()).Where(b => b.Length > 0).ToList();
var tables = new List<TableBlock>();
var droppedForeignKeys = 0;
var unknown = new List<string>();

foreach (var batch in batches)
{
    if (batch.StartsWith("IF SCHEMA_ID", StringComparison.Ordinal) || batch.Contains("CREATE SCHEMA", StringComparison.Ordinal)) continue;   // schema adm do script tự tạo

    var create = Regex.Match(batch, @"^CREATE TABLE \[(?<s>\w+)\]\.\[(?<t>\w+)\] \(", RegexOptions.CultureInvariant);
    if (create.Success)
    {
        if (create.Groups["s"].Value != "adm") { unknown.Add("bảng ngoài schema adm: " + create.Groups["s"].Value + "." + create.Groups["t"].Value); continue; }
        var lines = batch.Split('\n').Select(l => l.TrimEnd('\r')).ToList();
        var kept = new List<string>();
        foreach (var line in lines)
        {
            if (Regex.IsMatch(line, @"^\s*CONSTRAINT \[FK_\w+\] FOREIGN KEY", RegexOptions.CultureInvariant)) { droppedForeignKeys++; continue; }   // quy ước kho: KHÔNG khoá ngoại vật lý
            kept.Add(line);
        }

        // Bỏ dấu phẩy thừa ở dòng ràng buộc cuối (khoá ngoại thường đứng cuối, dòng trước nó đang có dấu phẩy)
        var closeAt = kept.FindLastIndex(l => l.TrimStart().StartsWith(");", StringComparison.Ordinal));
        if (closeAt > 0) kept[closeAt - 1] = kept[closeAt - 1].TrimEnd().TrimEnd(',');

        var body = kept.Skip(1).Take(closeAt - 1).ToList();   // giữa dòng "CREATE TABLE … (" và dòng ");"
        var columnCount = body.Count(l => l.StartsWith("    [", StringComparison.Ordinal));
        tables.Add(new TableBlock(create.Groups["t"].Value, string.Join("\n", kept), columnCount));
        continue;
    }

    var index = Regex.Match(batch, @"^CREATE (UNIQUE )?INDEX \[\w+\] ON \[(?<s>\w+)\]\.\[(?<t>\w+)\]", RegexOptions.CultureInvariant);
    if (index.Success)
    {
        var owner = tables.FirstOrDefault(t => t.Name == index.Groups["t"].Value);
        if (owner is null) { unknown.Add("chỉ mục đứng trước bảng của nó: " + batch[..Math.Min(80, batch.Length)]); continue; }
        owner.Indexes.Add(batch.TrimEnd(';') + ";");
        continue;
    }

    if (Regex.IsMatch(batch, @"^ALTER TABLE \[\w+\]\.\[\w+\] ADD CONSTRAINT \[FK_\w+\] FOREIGN KEY", RegexOptions.CultureInvariant)) { droppedForeignKeys++; continue; }

    unknown.Add(batch[..Math.Min(120, batch.Length)].Replace("\n", " "));
}

if (unknown.Count > 0)
{
    Console.Error.WriteLine("EF sinh ra " + unknown.Count + " lô công cụ chưa biết xử lý (dừng, không ghi tệp):");
    foreach (var u in unknown) Console.Error.WriteLine("  • " + u);
    return 3;
}

// ── Ngoại lệ so với mô hình EF ──
// GlobalModelRules (lõi) đánh dấu MỌI cột chuỗi không phải khoá là nullable để EF đọc an toàn dữ liệu cũ, nên DDL sinh từ EF cho phép NULL ở cả cột mà lược đồ thật là NOT NULL.
// Giữ nguyên vì mô hình EF cùng nguồn đã chạy thật. RIÊNG bảng có script SQL chính thức tự kiểm hình dạng thì phải KHỚP script đó, nếu không script chính thức chạy sau sẽ báo lệch (THROW 52009).
// Mỗi ngoại lệ phải khớp đúng một lần, không thì công cụ dừng (mô hình hoặc script chính thức đã đổi — xem lại).
var overrides = new List<(string Table, string From, string To, string Why)>();
if (linked) overrides.Add(("SsoClientSession", "[Sid] nvarchar(64) NULL,", "[Sid] nvarchar(64) NOT NULL,", "script chính thức của module SsoClient: Sid NOT NULL (EF cho NULL do GlobalModelRules)"));
foreach (var o in overrides)
{
    var target = tables.FirstOrDefault(t => t.Name == o.Table);
    var occurrences = target is null ? 0 : target.CreateSql.Split(o.From).Length - 1;
    if (target is null || occurrences != 1)
    {
        Console.Error.WriteLine($"Ngoại lệ không áp được ({occurrences} chỗ khớp) cho {o.Table}: {o.Why}");
        return 3;
    }
    tables[tables.IndexOf(target)] = target with { CreateSql = target.CreateSql.Replace(o.From, o.To) };
}

// Bảng sổ phiên bản lược đồ: KHÔNG do mô hình EF sinh — thêm tay, đúng cột mà các script SQL mong đợi.
const string SchemaVersionCreate = """
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
    """;
if (!tables.Any(t => t.Name == "SchemaVersion")) tables.Add(new TableBlock("SchemaVersion", SchemaVersionCreate, 7));
tables = tables.OrderBy(t => t.Name, StringComparer.Ordinal).ToList();

// ── mô tả theo chế độ (chỉ phần chữ trong chú thích đầu tệp) ──
var modeIntro = linked
    ? "phần mềm chạy Deployment:Mode=Linked — người dùng / vai trò / quyền ĐỒNG BỘ từ máy chủ SSO (SCIM, mặc định mỗi 5 phút), các bảng còn lại phần mềm TỰ GIỮ"
    : "phần mềm chạy Deployment:Mode=Standalone — phần mềm TỰ quản trị tài khoản / phân quyền trong CSDL này (không có bảng của module SsoClient)";
var permissionNote = linked
    ? "Nếu sau này bật đồng bộ SSO: tài khoản kết nối của API còn cần ALTER trên các bảng identity để bật SET IDENTITY_INSERT (README module SsoClient mục \"Quyền CSDL\")."
    : "Phần mềm tự quản trị tài khoản nên không cần quyền đồng bộ SSO.";
var afterRun = linked
    ? ".env của phần mềm chỉ đặt MỘT chuỗi ConnectionStrings__OperationalConnection = CSDL này (không còn DefaultConnection, D-CORE-97); Deployment__SsoSync__Mode = DryRun trước, kiểm số đếm ở màn Sức khỏe hệ thống rồi mới Apply."
    : ".env của phần mềm đặt ConnectionStrings__OperationalConnection = CSDL này (D-CORE-97), rồi khởi động API để tạo tài khoản quản trị đầu tiên theo hướng dẫn của lõi.";

// Khuôn tệp SQL (các chỗ {{…}} do công cụ điền). Khuôn: @ConfirmDb bắt buộc, @DryRun mặc định 1, một giao dịch, kiểm lại hình dạng, ghi sổ.
const string Template = """
/*
   Tạo các bảng lõi schema [adm] ({{TABLE_COUNT}} bảng) trong CSDL NGHIỆP VỤ của {{MODE_INTRO}}.
   Phần mềm: {{APP}} · Dự án: {{PROJECT}} · Lõi nền tảng: {{CORE_VERSION}} (mô hình EF của đúng bản lõi này).
   FILE NÀY ĐƯỢC SINH bằng scripts/gen-adm-script.cs ở thư mục dự án — ĐỪNG sửa tay; mô hình lõi đổi (nâng bản lõi) thì sinh lại:
       node scripts/gen-adm-script.mjs --app {{APP}} --mode {{MODE}} --out <tệp mới>

   Vì sao: D-CORE-93 / D-CORE-94 — phần mềm KHÔNG dùng CSDL lõi riêng. Mỗi phần mềm chỉ có MỘT CSDL nghiệp vụ chứa cả bảng `dbo` (nghiệp vụ) lẫn bảng `adm` này.
   Danh sách bảng của script: {{TABLE_LIST}}.
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
   Quyền cần có: CREATE TABLE + CREATE SCHEMA (nếu chưa có schema adm) — vd db_ddladmin. {{PERMISSION_NOTE}}

   Chạy:  sqlcmd -S <máy chủ> -d <CSDL nghiệp vụ> -U <tài khoản> -b -I -f 65001 -i scripts\sql\{{SCRIPT_NAME}}   (đường dẫn tính từ thư mục repo phần mềm)
          hoặc mở bằng SSMS (tệp UTF-8 có BOM; nếu chữ tiếng Việt vỡ thì script dừng 52001) — trước đó SỬA @ConfirmDb ở dưới = đúng tên CSDL.
          MẶC ĐỊNH @DryRun = 1: chạy thử — làm hết rồi ROLLBACK, in những gì sẽ tạo. Đọc kết quả, rồi đặt @DryRun = 0 để chạy thật (COMMIT).
   Sau khi chạy thật: {{AFTER_RUN}}
   Rollback (KHÔNG tự chạy): chỉ DROP TABLE các bảng mà lần chạy THẬT báo "+ đã tạo" (KHÔNG xoá bảng báo "= đã có", vd adm.Log); rồi DELETE FROM adm.SchemaVersion WHERE Script = N'{{SCRIPT_NAME}}'.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
IF UNICODE(N'ồ') <> 7891 THROW 52001, N'Sai bang ma: chay lai bang sqlcmd -f 65001 -i <file>', 1;
IF OBJECT_ID(N'[adm].[IdpSession]', N'U') IS NOT NULL OR OBJECT_ID(N'[adm].[App]', N'U') IS NOT NULL
    THROW 52002, N'Chạy nhầm CSDL: có adm.IdpSession hoặc adm.App — đây là CSDL của máy chủ SSO. Script này chỉ dành cho CSDL nghiệp vụ của phần mềm. Không có gì bị đổi.', 1;

-- ⚠ BẮT BUỘC SỬA: đặt đúng tên CSDL nghiệp vụ của phần mềm {{APP}}. Để trống / sai tên → dừng, không đổi gì.
DECLARE @ConfirmDb  sysname      = N'';
DECLARE @DryRun     bit          = 1;          -- MẶC ĐỊNH 1 = chạy thử (làm hết rồi ROLLBACK) · duyệt xong đặt 0 = chạy thật (COMMIT)
DECLARE @AppVersion nvarchar(20) = N'{{APP_VERSION}}';   -- ghi sổ adm.SchemaVersion — sửa theo bản phát hành của phần mềm

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
{{BLOCKS}}

-- ═══════════════ 2. Kiểm lại hình dạng cuối (đủ bảng, số cột khớp mô hình EF, không khoá ngoại vật lý) ═══════════════
DECLARE @Bad nvarchar(max) = N'';
DECLARE @Expect TABLE (TableName sysname NOT NULL, ColCount int NOT NULL);
INSERT @Expect (TableName, ColCount) VALUES
{{EXPECTED_ROWS}}

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
PRINT N'2. Kiểm lại hình dạng cuối: đạt ({{TABLE_COUNT}} bảng, số cột khớp mô hình EF, không khoá ngoại vật lý)';

IF @DryRun = 1
BEGIN
    ROLLBACK TRAN;
    PRINT N'>>> CHẠY THỬ (@DryRun = 1): đã ROLLBACK, CSDL KHÔNG đổi. Duyệt các dòng "+ đã tạo" / "= đã có" ở trên rồi đặt @DryRun = 0 để chạy thật.';
END
ELSE
BEGIN
    COMMIT TRAN;
    PRINT N'>>> ĐÃ CHẠY THẬT (COMMIT). Bước tiếp: {{NEXT_STEP}}';
END

-- ── Ghi sổ — NGOÀI giao dịch; chỉ khi chạy thật; thời gian = giờ Việt Nam ──
IF @DryRun = 0 AND OBJECT_ID(N'[adm].[SchemaVersion]', N'U') IS NOT NULL
BEGIN
    UPDATE [adm].[SchemaVersion] SET LastAppliedAt = DATEADD(HOUR, 7, SYSUTCDATETIME()), RunCount = RunCount + 1, AppliedBy = SUSER_SNAME(), HostName = HOST_NAME()
    WHERE Script = N'{{SCRIPT_NAME}}';
    IF @@ROWCOUNT = 0
        INSERT INTO [adm].[SchemaVersion] (Script, AppVersion, AppliedAt, LastAppliedAt)
        VALUES (N'{{SCRIPT_NAME}}', @AppVersion, DATEADD(HOUR, 7, SYSUTCDATETIME()), DATEADD(HOUR, 7, SYSUTCDATETIME()));
END
""";

// ── ghép tệp ──
var blocks = new StringBuilder();
var expected = new StringBuilder();
var number = 0;
foreach (var t in tables)
{
    number++;
    blocks.AppendLine($"-- {number}. [adm].[{t.Name}]");
    blocks.AppendLine($"IF OBJECT_ID(N'[adm].[{t.Name}]', N'U') IS NULL");
    blocks.AppendLine("BEGIN");
    foreach (var line in t.CreateSql.Split('\n')) blocks.AppendLine("    " + line.TrimEnd('\r'));
    foreach (var idx in t.Indexes) blocks.AppendLine("    " + idx.Replace("\r", "").Replace("\n", " "));
    blocks.AppendLine($"    PRINT N'  + đã tạo [adm].[{t.Name}]';");
    blocks.AppendLine("END");
    blocks.AppendLine($"ELSE PRINT N'  = [adm].[{t.Name}] đã có — GIỮ NGUYÊN (chỉ kiểm số cột ở bước kiểm lại)';");
    blocks.AppendLine();
    expected.AppendLine($"    (N'{t.Name}', {t.ColumnCount}){(number == tables.Count ? ";" : ",")}");
}

var script = Template
    .Replace("{{MODE_INTRO}}", modeIntro)
    .Replace("{{PERMISSION_NOTE}}", permissionNote)
    .Replace("{{AFTER_RUN}}", afterRun)
    .Replace("{{NEXT_STEP}}", linked ? "bật đồng bộ SSO ở chế độ DryRun." : "khởi động API và tạo tài khoản quản trị đầu tiên.")
    .Replace("{{SCRIPT_NAME}}", scriptName)
    .Replace("{{MODE}}", linked ? "Linked" : "Standalone")
    .Replace("{{APP}}", appCode)
    .Replace("{{PROJECT}}", projectName)
    .Replace("{{APP_VERSION}}", appVersion)
    .Replace("{{CORE_VERSION}}", coreVersion)
    .Replace("{{TABLE_COUNT}}", tables.Count.ToString())
    .Replace("{{BLOCKS}}", blocks.ToString().TrimEnd())
    .Replace("{{EXPECTED_ROWS}}", expected.ToString().TrimEnd())
    .Replace("{{TABLE_LIST}}", string.Join(", ", tables.Select(t => t.Name)));

Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
File.WriteAllText(outPath, script.Replace("\r\n", "\n").Replace("\n", "\r\n"), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
Console.WriteLine($"Đã ghi {outPath}");
Console.WriteLine($"Chế độ: {(linked ? "Linked" : "Standalone")} · số bảng: {tables.Count} (gồm adm.SchemaVersion tạo tay) · khoá ngoại đã bỏ: {droppedForeignKeys} · chỉ mục: {tables.Sum(t => t.Indexes.Count)}");
Console.WriteLine("Bảng: " + string.Join(", ", tables.Select(t => $"{t.Name}({t.ColumnCount})")));
return 0;

// ════════════════════════════════════════════════════════════════════════════
// Kiểu và khuôn script (đặt SAU các câu lệnh cấp cao nhất)
// ════════════════════════════════════════════════════════════════════════════

/// <summary>Một bảng đã tách ra từ script EF: tên bảng, câu CREATE TABLE đã bỏ khoá ngoại, số cột (để kiểm lại hình dạng) và các câu CREATE INDEX đi kèm.</summary>
internal sealed record TableBlock(string Name, string CreateSql, int ColumnCount)
{
    /// <summary>Các câu CREATE INDEX của bảng — chỉ chạy khi bảng được TẠO MỚI (bảng đã có thì giữ nguyên, không thêm chỉ mục).</summary>
    public List<string> Indexes { get; } = [];
}

/// <summary>
/// Context lõi cho CSDL Linked: CoreDbContext cộng cấu hình thực thể của module SsoClient (adm.SsoClientSession · adm.SsoSyncState). Không có module nghiệp vụ App.*.
/// </summary>
internal sealed class LinkedCoreContext(DbContextOptions options) : CoreDbContext(options)
{
    /// <summary>Hàm làm gì: nạp cấu hình thực thể của module SsoClient vào mô hình EF (điểm mở rộng của dự án). Tham số: b — bộ dựng mô hình. Trả về: không. Tác dụng phụ: thêm cấu hình thực thể vào mô hình.</summary>
    protected override void ConfigureProjectModel(ModelBuilder b) => b.ApplyConfigurationsFromAssembly(typeof(PTCore.Modules.SsoClient.SsoClientModule).Assembly);
}

/// <summary>Context lõi cho CSDL Standalone: CoreDbContext thuần — mô hình lõi không thêm gì (phần mềm tự quản trị tài khoản, không có module SsoClient).</summary>
internal sealed class StandaloneCoreContext(DbContextOptions options) : CoreDbContext(options)
{
}

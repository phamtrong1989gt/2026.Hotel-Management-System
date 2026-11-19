namespace App.Tests.PMS;

/// <summary>
/// Đường dẫn gốc cho các gate quét mã nguồn của PHẦN MỀM PMS. Gốc = thư mục tổ tiên đầu tiên chứa một tệp <c>*.sln</c> / <c>*.slnx</c>
/// (KHÔNG hard-code tên solution — đổi tên solution không làm gate đỏ). Dựng sẵn bởi <c>_bmad/tests/new-project.mjs</c> (bố cục tách: repo phần mềm KHÔNG có thư mục <c>src</c> riêng).
/// </summary>
internal static class RepoPaths
{
    /// <summary>Gốc repo phần mềm (thư mục chứa tệp <c>*.sln</c> / <c>*.slnx</c>).</summary>
    public static string Root => Find();

    /// <summary>
    /// Thư mục <c>src</c> của LÕI nền tảng (<c>&lt;lõi&gt;/src</c>: <c>Core</c>, <c>Services</c>). Lõi tìm qua <see cref="PTCore.Tests.WorkspaceLayout"/> (cùng thứ tự với <c>Directory.Build.props</c>:
    /// <c>platform.local.props</c> → <c>PLATFORM_ROOT</c> → <c>workspace.json</c> → mặc định theo bố cục chuẩn).
    /// </summary>
    public static string Src => Path.Combine(PTCore.Tests.WorkspaceLayout.Current.PlatformRoot, "src");

    /// <summary>
    /// Vùng BE của phần mềm PMS tính từ <c>src/</c> (dấu <c>/</c>): <c>Apps/PMS/BE</c> — truyền cho các lớp nền quét mã nguồn của lõi (<c>KhuVuc</c>, <c>KhuVucTheoDuongDan</c>)
    /// vì chúng nhận đường dẫn tính từ <c>src/</c>; mọi gate của phần mềm trỏ vào cùng một chỗ này thay vì viết lại chuỗi.
    /// </summary>
    public const string BeArea = "Apps/PMS/BE";

    /// <summary>Vùng module của phần mềm (<c>App.Modules.*</c>) tính từ <c>src/</c> (dấu <c>/</c>): <c>Apps/PMS/BE/Modules</c>.</summary>
    public const string ModulesArea = BeArea + "/Modules";

    /// <summary>Đường dẫn tuyệt đối tới thư mục phần mềm PMS (gốc repo; đường dẫn logic là <c>src/Apps/PMS</c>).</summary>
    public static string Software => Root;

    /// <summary>Đường dẫn tuyệt đối tới hồ sơ hợp đồng RIÊNG của phần mềm (<c>_contracts</c>, khớp <c>paths.contracts</c> ở <c>app.yaml</c>).</summary>
    public static string Contracts => Path.Combine(Software, "_contracts");

    /// <summary>Đường dẫn tuyệt đối tới script SQL RIÊNG của phần mềm (<c>scripts/sql</c>, D-CORE-173).</summary>
    public static string Sql => Path.Combine(Software, "scripts", "sql");

    /// <summary>Đường dẫn tuyệt đối tới thư mục host API của phần mềm (<c>BE/App.Api.PMS</c>) — nơi có <c>Export</c>, <c>Services</c>, <c>Composition</c> và <c>appsettings*.json</c>.</summary>
    public static string Api => Path.Combine(Software, "BE", "App.Api.PMS");

    /// <summary>Đường dẫn tuyệt đối tới thư mục BE của phần mềm (host + module + test).</summary>
    public static string Be => Path.Combine(Software, "BE");

    /// <summary>Đường dẫn tuyệt đối tới thư mục module của phần mềm (<c>BE/Modules</c>).</summary>
    public static string Modules => Path.Combine(Software, "BE", "Modules");

    /// <summary>Đường dẫn tuyệt đối tới thư mục giao diện Angular của phần mềm (<c>FE</c>).</summary>
    public static string Fe => Path.Combine(Software, "FE");

    /// <summary>Gốc <c>src/app</c> của FE phần mềm này: <c>FE/src/app</c>.</summary>
    public static string FeAppRoot => Path.Combine(Fe, "src", "app");

    /// <summary>
    /// Hàm làm gì: tìm tệp mã nguồn FE theo đường dẫn "logic" tính từ <c>src/app</c> của ứng dụng — ưu tiên bản CỤC BỘ của ứng dụng, nếu không có thì lấy ở nguồn chung <c>src/Core/FE</c>
    /// (<c>platform/**</c> và MỌI module chung <c>modules/&lt;tên&gt;/**</c>). Tương đương cơ chế "cây logic" của <c>Core/FE/tools/fe-overlay-fs.mjs</c> mà các script kiểm FE dùng.
    /// </summary>
    /// <param name="feAppRoot">Thư mục <c>src/app</c> của MỘT ứng dụng FE.</param>
    /// <param name="relative">Đường dẫn tương đối từ <c>src/app</c>, dấu <c>/</c> (vd <c>platform/ui/...</c>, <c>modules/notification/...</c>).</param>
    /// <returns>Đường dẫn tuyệt đối tới tệp thật; không thấy ở đâu thì trả đường dẫn cục bộ (để nơi gọi báo "không còn tệp").</returns>
    public static string ResolveFe(string feAppRoot, string relative)
    {
        var os = relative.Replace('/', Path.DirectorySeparatorChar);
        var local = Path.Combine(feAppRoot, os);
        if (File.Exists(local)) return local;
        var inKit = relative.StartsWith("platform/", StringComparison.Ordinal) || relative.StartsWith("modules/", StringComparison.Ordinal);
        if (!inKit) return local;
        var shared = Path.Combine(Src, "Core", "FE", os);
        return File.Exists(shared) ? shared : local;
    }

    /// <summary>
    /// Hàm làm gì: tìm gốc repo bằng cách đi ngược từ thư mục chạy test tới thư mục đầu tiên có tệp <c>*.sln</c> / <c>*.slnx</c>.
    /// Tham số: không. Trả về: đường dẫn tuyệt đối thư mục gốc. Tác dụng phụ: đọc thư mục; ném <see cref="InvalidOperationException"/> nếu không thấy gốc.
    /// </summary>
    private static string Find()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && dir.GetFiles("*.sln").Length == 0 && dir.GetFiles("*.slnx").Length == 0) dir = dir.Parent;
        return dir?.FullName ?? throw new InvalidOperationException("Không tìm thấy gốc repo (thư mục chứa tệp *.sln hoặc *.slnx).");
    }
}

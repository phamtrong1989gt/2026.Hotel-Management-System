using System.Reflection;
using App.Api.PMS.Composition;
using App.Api.PMS.Persistence;
using PTCore.Application;
using PTCore.Host;
using PTCore.Modules.FileStorage;
using PTCore.Modules.SsoClient;

namespace App.Api.PMS;

/// <summary>
/// Điểm ghép của PHẦN MỀM — mỏng. Toàn bộ trình tự khởi động / pipeline / xác thực / MVC nằm ở <see cref="CoreStartup{TContext}"/> (PTCore.Host, đi theo lõi);
/// ở đây chỉ khai những gì RIÊNG của phần mềm: tên ứng dụng, DbContext, module nghiệp vụ và assembly controller của chúng (xem <see cref="ProjectComposition"/>).
/// <para>Chế độ Linked: khi <c>Deployment:Mode=Linked</c> thì NẠP THÊM module khách SSO (<see cref="SsoClientModule"/>: DI + part controller);
/// ở Standalone / SsoServer module không được nạp nên tập route và mô hình EF không đổi. Mã phần mềm ở SSO lấy từ <c>Deployment__AppId</c>.</para>
/// </summary>
public class Startup : CoreStartup<ApplicationContext>
{
    /// <summary>
    /// Hàm làm gì: khởi tạo điểm ghép của phần mềm với tên ứng dụng <c>App.Api.PMS</c> (dùng cho vùng khoá Data Protection và trường App của nhật ký — KHÁC tên của mọi phần mềm khác
    /// để các ứng dụng chạy chung một máy không dùng chung vùng khoá / không lẫn nhật ký). Tham số: cấu hình + môi trường do host cấp. Trả về: không. Tác dụng phụ: không.
    /// </summary>
    /// <param name="configuration">Cấu hình ứng dụng.</param>
    /// <param name="env">Môi trường web host.</param>
    public Startup(IConfiguration configuration, IWebHostEnvironment env) : base(configuration, env, appName: "App.Api.PMS")
    {
    }

    /// <summary>Tên assembly chứa EF Migrations = tên dự án thật <c>App.Api.PMS</c> (cùng giá trị <see cref="ProjectComposition.AddAppPersistence"/> truyền cho <c>migrationsAssembly</c>).</summary>
    protected override string MigrationsAssembly => "App.Api.PMS";

    /// <summary>
    /// Chế độ triển khai là Linked: hàm làm gì — đọc cùng nguồn với <c>CoreStartup</c> (<see cref="DeploymentModeResolver"/>, một lần từ cấu hình lúc khởi động). Tham số: không (dùng <c>Configuration</c>).
    /// Trả về: true khi <c>Deployment:Mode=Linked</c>. Tác dụng phụ: không; giá trị lạ làm <see cref="DeploymentModeResolver"/> ném lỗi (host không khởi động, như mọi chế độ).
    /// </summary>
    private bool IsLinked => DeploymentModeResolver.Read(Configuration) == DeploymentMode.Linked;

    /// <summary>
    /// Hàm làm gì: đăng ký tầng dữ liệu của phần mềm (database Operational) — chuyển cho <see cref="ProjectComposition.AddProjectPersistence"/>.
    /// Tham số: <paramref name="services"/> — bộ đăng ký DI; <paramref name="isDevelopment"/> — có phải môi trường Development. Trả về: không. Tác dụng phụ: thêm DbContext Operational vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="isDevelopment">Có phải môi trường Development.</param>
    protected override void AddProjectPersistence(IServiceCollection services, bool isDevelopment)
        => services.AddProjectPersistence(isDevelopment);

    /// <summary>
    /// Hàm làm gì: đăng ký module nghiệp vụ của PMS và trình duyệt lưu trữ CHỈ-ĐỌC (Storage Explorer — mục cấu hình <c>StorageExplorer</c>, mặc định TẮT ⇒ route trả 404); ở chế độ Linked đăng ký THÊM
    /// module khách SSO (<see cref="SsoClientModule"/>: BFF đăng nhập, Back-Channel Logout, chạm phiên, đồng bộ định kỳ). Tham số: <paramref name="services"/> — bộ đăng ký DI; <paramref name="isDevelopment"/> — có phải Development.
    /// Trả về: không. Tác dụng phụ: thêm dịch vụ vào DI (Linked: cả dịch vụ nền đồng bộ SSO — chế độ mặc định DryRun); cấu hình <c>StorageExplorer</c> sai khi bật ⇒ API không khởi động.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="isDevelopment">Có phải Development.</param>
    protected override void AddProjectModules(IServiceCollection services, bool isDevelopment)
    {
        services.AddAppModules(isDevelopment, Configuration, IWebHostEnvironment.ContentRootPath);
        services.AddFileStorageExplorer(Configuration);
        if (IsLinked) services.AddSsoClientModule(Configuration);
    }

    /// <summary>
    /// Hàm làm gì: assembly chứa controller của phần mềm; ở chế độ Linked thêm assembly module khách SSO (controller <c>SsoClientController</c>, <c>SsoSyncController</c>).
    /// Tham số: <paramref name="isDevelopment"/> — có phải Development. Trả về: danh sách assembly cho <c>ApplicationPartManager</c>. Tác dụng phụ: không.
    /// </summary>
    /// <param name="isDevelopment">Có phải Development.</param>
    /// <returns>Các assembly controller cần nạp.</returns>
    protected override IEnumerable<Assembly> ProjectControllerAssemblies(bool isDevelopment)
        => IsLinked ? ProjectComposition.ControllerAssemblies.Append(typeof(SsoClientModule).Assembly) : ProjectComposition.ControllerAssemblies;

    /// <summary>Assembly sandbox (<c>api/test/*</c>) — PMS không có module sandbox nên là <c>null</c>.</summary>
    protected override Assembly? SandboxAssembly => ProjectComposition.SandboxAssembly;
}

using System.Reflection;
using App.Api.PMS.Persistence;
using PTCore.Host.Composition;
using PTCore.Modules.Platform.Application.DataSources;

namespace App.Api.PMS.Composition;

/// <summary>
/// Cách PHẦN MỀM ghép vào host lõi — một chỗ duy nhất cho <c>Startup</c> và cho test dựng "đúng như app thật".
/// <para>Thêm module nghiệp vụ mới: thêm assembly controller vào <see cref="ControllerAssemblies"/> và cầu nối lát cắt DbContext vào
/// <see cref="AddProjectPersistence"/> (đăng ký DI + ánh xạ Mapster nằm ở <see cref="ModuleServiceExtensions.AddAppModules"/>).</para>
/// </summary>
public static class ProjectComposition
{
    /// <summary>Assembly chứa controller của module nghiệp vụ (ApplicationPart).</summary>
    public static IReadOnlyList<Assembly> ControllerAssemblies { get; } =
    [
        typeof(App.Modules.PMS.PmsModule).Assembly,
    ];

    /// <summary>Assembly sandbox (<c>api/test/*</c>) — PMS KHÔNG có module sandbox <c>App.Modules.Test</c> nên là <c>null</c>; lõi hiểu "phần mềm không có sandbox".</summary>
    public static Assembly? SandboxAssembly => null;

    /// <summary>
    /// Hàm làm gì: đăng ký database của module nghiệp vụ (vai trò Operational): <see cref="OperationalContext"/> riêng + cầu nối lát cắt <c>IPmsDbContext</c> trỏ về CÙNG một instance trong mỗi scope.
    /// Chuỗi kết nối khai ở <c>.env</c> như Core (<c>ConnectionStrings__OperationalConnection</c>), xác định một lần lúc khởi động.
    /// Tham số: <paramref name="services"/> — bộ đăng ký DI; <paramref name="isDevelopment"/> — có phải Development. Trả về: chính <paramref name="services"/>. Tác dụng phụ: thêm DbContext vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="isDevelopment">Có phải môi trường Development.</param>
    /// <returns>Chính <paramref name="services"/> để nối lệnh.</returns>
    public static IServiceCollection AddProjectPersistence(this IServiceCollection services, bool isDevelopment)
    {
        services.AddRoleDbContext<OperationalContext>(DataSourceRole.Operational);
        services.AddScoped<App.Modules.PMS.Persistence.IPmsDbContext>(sp => sp.GetRequiredService<OperationalContext>());
        return services;
    }

    /// <summary>
    /// Hàm làm gì: tầng dữ liệu đầy đủ của app — DbContext Core + cầu nối lõi (host) + database Operational của phần mềm.
    /// Tham số: <paramref name="services"/> — DI; <paramref name="configuration"/> — cấu hình; <paramref name="isDevelopment"/> — có phải Development. Trả về: chính <paramref name="services"/>. Tác dụng phụ: thêm DbContext vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="configuration">Cấu hình ứng dụng.</param>
    /// <param name="isDevelopment">Có phải môi trường Development.</param>
    /// <returns>Chính <paramref name="services"/> để nối lệnh.</returns>
    public static IServiceCollection AddAppPersistence(this IServiceCollection services, IConfiguration configuration, bool isDevelopment)
    {
        services.AddAppPersistence<ApplicationContext>(configuration, migrationsAssembly: "App.Api.PMS");
        return services.AddProjectPersistence(isDevelopment);
    }

    /// <summary>
    /// Hàm làm gì: MVC đầy đủ của app — lõi + controller module của phần mềm (không có sandbox). Tham số: <paramref name="services"/> — DI; <paramref name="isDevelopment"/> — có phải Development.
    /// Trả về: chính <paramref name="services"/>. Tác dụng phụ: thêm MVC + assembly controller vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="isDevelopment">Có phải môi trường Development.</param>
    /// <returns>Chính <paramref name="services"/> để nối lệnh.</returns>
    public static IServiceCollection AddAppMvc(this IServiceCollection services, bool isDevelopment)
        => MvcServiceExtensions.AddAppMvc(services, isDevelopment, ControllerAssemblies, SandboxAssembly);
}

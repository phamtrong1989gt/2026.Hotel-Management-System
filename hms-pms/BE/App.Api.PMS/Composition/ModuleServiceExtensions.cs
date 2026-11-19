using App.Api.PMS.Services;
using App.Modules.PMS;
using PTCore.Host.Composition;

namespace App.Api.PMS.Composition;

/// <summary>
/// Module của PHẦN MỀM: nghiệp vụ (<c>App.Modules.PMS</c>) và phần cắm vào khe của lõi (<c>App.Api.PMS/Services</c>).
/// <para>Danh sách module LÕI + ánh xạ (Mapster) nằm ở <c>PTCore.Host</c> (<see cref="CoreModuleServiceExtensions"/>) — phần mềm KHÔNG sửa chúng.
/// Thêm module nghiệp vụ mới = thêm một dòng đăng ký + một assembly ánh xạ ở đây (và ở <see cref="ProjectComposition"/>: assembly controller vào <c>ControllerAssemblies</c> + lát cắt DbContext trỏ <c>OperationalContext</c>).</para>
/// </summary>
public static class ModuleServiceExtensions
{
    /// <summary>
    /// Hàm làm gì: đăng ký module của phần mềm và bộ ánh xạ Mapster (lõi + phần mềm, MỘT lần). Module lõi đã được <c>AddCoreModules</c> đăng ký trước đó.
    /// Tham số: <paramref name="services"/> — DI; <paramref name="isDevelopment"/> — có phải Development; <paramref name="configuration"/> và <paramref name="contentRootPath"/> — giữ chữ ký chuẩn cho nơi gọi, hiện chưa module nào của PMS dùng.
    /// Trả về: chính <paramref name="services"/>. Tác dụng phụ: thêm dịch vụ vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <param name="isDevelopment">Có phải môi trường Development.</param>
    /// <param name="configuration">Cấu hình ứng dụng (chưa dùng).</param>
    /// <param name="contentRootPath">Thư mục gốc nội dung của host (chưa dùng).</param>
    /// <returns>Chính <paramref name="services"/> để nối lệnh.</returns>
    public static IServiceCollection AddAppModules(this IServiceCollection services, bool isDevelopment, IConfiguration? configuration = null, string? contentRootPath = null)
    {
        // Phần cắm của PHẦN MỀM vào khe của lõi: lõi (module Vận hành) định nghĩa việc đo dung lượng đã dùng; phần mềm quy về đơn vị theo dữ liệu nặng của mình (hiện chưa có nên đo rỗng).
        services.AddScoped<PTCore.Modules.Operations.Application.Usage.IUsageStorageMeasureService, UsageStorageMeasureService>();
        services.AddPmsModule();   // nghiệp vụ của phần mềm (kho tệp chỉ qua File API)

        var projectMappers = new List<System.Reflection.Assembly>
        {
            typeof(PmsModule).Assembly,   // PMS (nghiệp vụ phần mềm)
        };
        services.AddCoreMapping(projectMappers);

        return services;
    }
}

using App.Modules.PMS.Persistence;
using Microsoft.Extensions.DependencyInjection;
using PTCore.Modules.Category.Application;

namespace App.Modules.PMS;

/// <summary>
/// Module registrar — nghiệp vụ của phần mềm PMS (database vai trò Operational). Mỗi entity mới: thêm repository (<c>AddRoutedRepository</c>) + dịch vụ (<c>AddRoleService</c>, + cache danh mục nếu có) ở đây — xem <c>README.md</c>.
/// Hiện CHƯA có nghiệp vụ nào (khung trống dựng 2026-11-20 bằng <c>_bmad/tests/new-project.mjs</c>): chỉ đăng ký hợp đồng bắt buộc của lõi (<see cref="IDepartmentUsageChecker"/>).
/// </summary>
public static class PmsModule
{
    /// <summary>
    /// Hàm làm gì: đăng ký toàn bộ module nghiệp vụ PMS vào DI. Hiện chỉ có <see cref="IDepartmentUsageChecker"/> — hợp đồng bắt buộc của lõi: <c>DepartmentService</c> (module Category) xin nó để chặn xóa đơn vị còn được tham chiếu;
    /// chưa có bảng nào của phần mềm tham chiếu đơn vị nên bản cài (<see cref="PmsDepartmentUsage"/>) trả rỗng.
    /// Tham số: <paramref name="services"/> — bộ đăng ký DI. Trả về: chính <paramref name="services"/> để nối lệnh. Tác dụng phụ: thêm dịch vụ vào DI.
    /// </summary>
    /// <param name="services">Bộ đăng ký DI.</param>
    /// <returns>Chính <paramref name="services"/> để nối lệnh.</returns>
    public static IServiceCollection AddPmsModule(this IServiceCollection services)
    {
        services.AddScoped<IDepartmentUsageChecker, PmsDepartmentUsage>();
        return services;
    }
}

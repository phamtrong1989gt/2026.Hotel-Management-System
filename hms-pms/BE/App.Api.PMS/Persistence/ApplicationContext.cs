using Microsoft.EntityFrameworkCore;
using PTCore.Application;
using PTCore.Host.Persistence;
using PTCore.Modules.SsoClient;

namespace App.Api.PMS.Persistence;

/// <summary>
/// DbContext của vai trò <b>Core</b> trong PHẦN MỀM = <see cref="CoreDbContext"/> (bảng lõi: người dùng, phân quyền, cấu hình, danh mục hệ thống, <c>adm.Log</c> của lõi, registry nguồn dữ liệu).
/// Bảng NGHIỆP VỤ của phần mềm (<c>App.Modules.PMS</c>) KHÔNG ở đây — chúng thuộc <see cref="OperationalContext"/> (database Operational riêng).
/// <para>Chế độ Linked: mô hình EF nạp THÊM bảng của module khách SSO (<c>adm.SsoClientSession</c>, <c>adm.SsoSyncState</c> — xem <see cref="SsoClientModule"/>);
/// Standalone / SsoServer giữ nguyên mô hình.</para>
/// </summary>
public class ApplicationContext : CoreDbContext
{
    /// <summary>
    /// Hàm làm gì: khởi tạo DbContext Core của phần mềm. Tham số: <paramref name="options"/> — tuỳ chọn EF do DI cấp. Trả về: không. Tác dụng phụ: không (chưa mở kết nối).
    /// </summary>
    /// <param name="options">Tuỳ chọn EF của <see cref="ApplicationContext"/>.</param>
    public ApplicationContext(DbContextOptions<ApplicationContext> options)
        : base(options)
    {
    }

    /// <summary>
    /// Điểm mở rộng mô hình của phần mềm: chỉ ở chế độ Linked nạp cấu hình thực thể của module khách SSO (<c>ApplyConfigurationsFromAssembly</c>); các chế độ khác không thêm gì (mô hình EF và schema không đổi).
    /// Tham số: <paramref name="builder"/> — bộ dựng mô hình EF. Trả về: không. Tác dụng phụ: thêm cấu hình thực thể vào <paramref name="builder"/>.
    /// </summary>
    /// <param name="builder">Bộ dựng mô hình EF.</param>
    protected override void ConfigureProjectModel(ModelBuilder builder)
    {
        base.ConfigureProjectModel(builder);
        if (DeploymentModel == DeploymentMode.Linked) builder.ApplyConfigurationsFromAssembly(typeof(SsoClientModule).Assembly);
    }
}

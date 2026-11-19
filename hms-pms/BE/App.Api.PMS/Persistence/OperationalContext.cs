using App.Modules.PMS.Persistence;
using Microsoft.EntityFrameworkCore;
using PTCore.Domain.SeedWork;
using PTCore.Host.Persistence;
using PTCore.Modules.AuditLog.Persistence;
using PTCore.Persistence.Base;

namespace App.Api.PMS.Persistence;

/// <summary>
/// DbContext của vai trò <b>Operational</b> — chỉ bảng NGHIỆP VỤ của phần mềm (<c>App.Modules.PMS</c>) cộng bảng <c>adm.Log</c> của CHÍNH database này. Database Operational là một CSDL riêng, nên:
/// <list type="bullet">
/// <item>Giao dịch nghiệp vụ và dòng nhật ký của nó nằm cùng database — dịch vụ của PMS đăng ký bằng <c>AddRoleService</c> nên nhận <c>ITransactionExecutor</c> / <c>ILogService</c> / <c>IBatchActionExecutor</c> gắn vai trò.</item>
/// <item>KHÔNG có bảng lõi (người dùng, đơn vị, phân quyền…): module PMS tra chúng qua dịch vụ của lõi, không join chéo database.</item>
/// <item>Chuỗi kết nối khai ở <c>.env</c> như Core (<c>ConnectionStrings__OperationalConnection</c>; tùy chọn <c>…OperationalReadConnection</c>), xác định một lần lúc khởi động.</item>
/// </list>
/// Quy tắc model toàn cục dùng chung với <see cref="CoreDbContext"/> (<see cref="GlobalModelRules"/>). Hiện CHƯA có bảng nghiệp vụ nào (khung trống): thêm bảng = khai <c>DbSet</c> ở <see cref="IPmsDbContext"/> + <c>IEntityTypeConfiguration</c> + DDL.
/// </summary>
public class OperationalContext
    : DbContext,
      IPmsDbContext,
      IAuditLogDbContext,
      IUnitOfWork,
      IDbContext
{
    /// <summary>
    /// Hàm làm gì: khởi tạo DbContext Operational. Tham số: <paramref name="options"/> — tuỳ chọn EF do DI cấp. Trả về: không. Tác dụng phụ: lưu <paramref name="options"/> vào <see cref="ContextOptions"/>; chưa mở kết nối.
    /// </summary>
    /// <param name="options">Tuỳ chọn EF của <see cref="OperationalContext"/>.</param>
    public OperationalContext(DbContextOptions<OperationalContext> options) : base(options)
    {
        ContextOptions = options;
    }

    /// <summary>Options lúc tạo — đọc ở <see cref="OnModelCreating"/> mà không chạm service provider giữa lúc dựng model.</summary>
    protected DbContextOptions ContextOptions { get; }

    /// <summary>
    /// Hàm làm gì: dựng mô hình EF — nạp cấu hình <c>adm.Log</c> (assembly AuditLog), cấu hình thực thể của module PMS, rồi áp quy tắc model toàn cục.
    /// Tham số: <paramref name="builder"/> — bộ dựng mô hình. Trả về: không. Tác dụng phụ: thêm cấu hình thực thể vào <paramref name="builder"/>.
    /// </summary>
    /// <param name="builder">Bộ dựng mô hình EF.</param>
    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // adm.Log của database này (nhật ký đi theo dữ liệu) — assembly AuditLog chỉ khai LogConfiguration.
        builder.ApplyConfigurationsFromAssembly(typeof(IAuditLogDbContext).Assembly);
        builder.ApplyConfigurationsFromAssembly(typeof(IPmsDbContext).Assembly);

        GlobalModelRules.Apply(builder);
    }

    /// <summary>
    /// Hàm làm gì: lưu mọi thay đổi đang chờ (hợp đồng <see cref="IUnitOfWork"/>). Tham số: <paramref name="cancellationToken"/> — huỷ thao tác. Trả về: luôn <c>true</c> khi lưu xong.
    /// Tác dụng phụ: ghi vào CSDL Operational.
    /// </summary>
    /// <param name="cancellationToken">Mã thông báo huỷ.</param>
    /// <returns><c>true</c> khi lưu xong.</returns>
    public async Task<bool> SaveEntitiesAsync(CancellationToken cancellationToken = default)
    {
        _ = await base.SaveChangesAsync(cancellationToken);
        return true;
    }
}

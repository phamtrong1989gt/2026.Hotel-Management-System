using PTCore.Modules.Category.Application;

namespace App.Modules.PMS.Persistence;

/// <summary>
/// Bản cài <see cref="IDepartmentUsageChecker"/> của module PMS — báo module này có bản ghi nào đang tham chiếu đơn vị (<c>adm.Department</c>) hay không, để <c>DepartmentService</c> chặn xóa đơn vị còn được dùng.
/// Lõi chỉ nhận MỘT bản cài → mọi bảng của PMS có cột <c>DepartmentId</c> phải được thêm vào ĐÂY. Hiện CHƯA có bảng nào nên luôn trả rỗng (đúng, không phải lỗi).
/// <para>Khi thêm entity có khóa đơn vị: nhận <see cref="IPmsDbContext"/> qua constructor, hợp nguồn đó trong <see cref="GetUsedDepartmentIdsAsync"/> và thêm một <see cref="DepartmentUsageItem"/> trong <see cref="GetUsageAsync"/>.</para>
/// </summary>
public sealed class PmsDepartmentUsage : IDepartmentUsageChecker
{
    /// <inheritdoc />
    /// <remarks>[Rule] Chưa có bảng nào tham chiếu đơn vị ⇒ luôn trả tập rỗng, không chạm CSDL.</remarks>
    public Task<HashSet<int>> GetUsedDepartmentIdsAsync(List<int> departmentIds)
        => Task.FromResult(new HashSet<int>());

    /// <inheritdoc />
    /// <remarks>[Rule] Chỉ trả mục có Count &gt; 0 (theo hợp đồng của lõi) — chưa có bảng nào nên danh sách rỗng.</remarks>
    public Task<List<DepartmentUsageItem>> GetUsageAsync(int departmentId)
        => Task.FromResult(new List<DepartmentUsageItem>());
}

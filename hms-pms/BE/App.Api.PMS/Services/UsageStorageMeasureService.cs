using PTCore.Common;
using PTCore.Modules.Operations.Application.Usage;

namespace App.Api.PMS.Services;

/// <summary>
/// Phần cắm của PHẦN MỀM vào khe đo dung lượng của lõi (<see cref="IUsageStorageMeasureService"/>). Hiện RỖNG (khung trống): phần mềm chưa có dữ liệu nặng (ảnh / video / tệp) nào để quy về đơn vị,
/// nên lượt đo trả bảng trống — đó là câu trả lời đúng, không phải lỗi. Lõi vẫn cần MỘT bản cài đã đăng ký (<c>UsageDashboardController</c> xin nó qua constructor), vì vậy lớp này được giữ lại
/// và đăng ký ở <c>ModuleServiceExtensions.AddAppModules</c>.
/// <para>Khi phần mềm có dữ liệu nặng: đo từ cột kích thước của bảng nghiệp vụ (nhận <c>IPmsDbContext</c> qua constructor), cộng theo đơn vị vào <see cref="UsageStorageSnapshotDTO.Departments"/>,
/// và điền bù kích thước tệp chưa biết trong <see cref="BackfillAsync"/>.</para>
/// </summary>
public sealed class UsageStorageMeasureService : IUsageStorageMeasureService
{
    /// <summary>
    /// Hàm làm gì: đo dung lượng đã dùng theo đơn vị — hiện trả ảnh chụp RỖNG kèm ghi chú. Tham số: <paramref name="ct"/> — huỷ thao tác (chưa dùng).
    /// Trả về: ảnh chụp dung lượng với <c>MeasuredAt</c> = giờ hiện tại và <c>Note</c> nói phần mềm chưa khai dữ liệu cần đo. Tác dụng phụ: không.
    /// </summary>
    /// <param name="ct">Mã thông báo huỷ.</param>
    /// <returns>Ảnh chụp dung lượng rỗng.</returns>
    public Task<UsageStorageSnapshotDTO> MeasureAsync(CancellationToken ct = default)
        => Task.FromResult(new UsageStorageSnapshotDTO
        {
            MeasuredAt = AppClock.Now,
            Note = "Phần mềm chưa khai dữ liệu nào cần đo dung lượng theo đơn vị.",
        });

    /// <summary>
    /// Hàm làm gì: điền bù kích thước tệp chưa biết — hiện không có gì để điền. Tham số: <paramref name="budget"/> — ngân sách thời gian; <paramref name="includeMissing"/> — có xử lý cả tệp thiếu; <paramref name="ct"/> — huỷ thao tác.
    /// Trả về: số tệp đã điền bù (luôn 0). Tác dụng phụ: không.
    /// </summary>
    /// <param name="budget">Ngân sách thời gian cho lượt điền bù.</param>
    /// <param name="includeMissing">Có xử lý cả tệp thiếu kích thước.</param>
    /// <param name="ct">Mã thông báo huỷ.</param>
    /// <returns>Số tệp đã điền bù (0).</returns>
    public Task<int> BackfillAsync(TimeSpan budget, bool includeMissing, CancellationToken ct = default)
        => Task.FromResult(0);
}

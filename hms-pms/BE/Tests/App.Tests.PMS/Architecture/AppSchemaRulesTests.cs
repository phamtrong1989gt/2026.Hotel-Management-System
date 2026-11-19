using PTCore.Tests.Architecture;

namespace App.Tests.PMS.Architecture;

/// <summary>
/// Chỗ ĐẶT BẢNG của module nghiệp vụ của phần mềm (<c>App.Modules.*</c>): lược đồ <c>dbo</c>, khai TƯỜNG MINH. Luật cho bảng lõi (<c>adm</c>) ở <c>SchemaRulesTests</c> (PTCore.Tests);
/// bộ quét <see cref="SchemaRulesTests.Mappings(string, System.Reflection.Assembly)"/> dùng chung — truyền assembly của CHÍNH dự án test này nên quét <c>src/Apps/PMS/BE/Modules</c>
/// (mã suy từ tên <c>App.Tests.PMS</c>), không phải module của phần mềm khác.
/// </summary>
public sealed class AppSchemaRulesTests
{
    /// <summary>Lược đồ của module nghiệp vụ ứng dụng.</summary>
    private const string AppSchema = "dbo";

    /// <summary>
    /// Hàm làm gì: mọi <c>ToTable</c> của module PMS phải khai lược đồ <c>dbo</c> tường minh. Tham số: không. Trả về: không (xUnit). Tác dụng phụ: đọc mã nguồn dưới <c>src/Apps/PMS/BE/Modules</c>.
    /// <para>KHÔNG đòi <c>mappings</c> không rỗng, vì PMS đang là khung trống (chưa có bảng). Khi có bảng nghiệp vụ đầu tiên, thêm lại dòng
    /// <c>mappings.Should().NotBeEmpty(...)</c> để bộ quét trỏ nhầm thư mục thì gate đỏ chứ không xanh giả.</para>
    /// </summary>
    [Fact]
    public void BangCuaModuleUngDung_PhaiKhaiLuocDoTuongMinh()
    {
        var mappings = SchemaRulesTests.Mappings("App.Modules.", typeof(AppSchemaRulesTests).Assembly).ToList();

        var offenders = mappings
            .Where(x => x.Schema != AppSchema)
            .Select(x => $"{x.File}: bảng '{x.Table}' " +
                         (x.Schema.Length == 0
                             ? "không khai lược đồ (EF sẽ dùng dbo — hãy viết ra)"
                             : $"khai lược đồ '{x.Schema}'; bảng nghiệp vụ thuộc '{AppSchema}', nếu đây là bảng lõi thì chuyển nó sang dự án PTCore.Modules.*"))
            .ToList();

        offenders.Should().BeEmpty();
    }
}

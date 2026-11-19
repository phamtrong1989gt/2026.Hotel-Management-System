using PTCore.Persistence.Base;

namespace App.Modules.PMS.Persistence;

/// <summary>
/// Slice interface — bề mặt <c>DbSet</c> của module PMS (default impl — <c>OperationalContext</c> không phải khai DbSet). Hiện RỖNG: phần mềm chưa có bảng nghiệp vụ nào (khung trống).
/// <para>Thêm entity mới: khai <c>DbSet&lt;X&gt; Xs =&gt; Set&lt;X&gt;();</c> ở đây và đặt lớp <c>IEntityTypeConfiguration&lt;X&gt;</c> trong <c>Persistence/Configurations</c>
/// (<c>OperationalContext</c> nạp cả assembly này; bảng của phần mềm nằm ở <c>dbo</c> — khai tường minh <c>ToTable("X", "dbo")</c>).</para>
/// </summary>
public interface IPmsDbContext : IDbContext
{
}

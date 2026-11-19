using PTCore.Tests.Architecture;

namespace App.Tests.PMS.Architecture;

/// <summary>Bố cục module của PHẦN MỀM (<c>src/Apps/PMS/BE/Modules</c>) — cùng luật với lõi (<see cref="ModuleLayoutRulesBase"/>), ngoại lệ riêng của phần mềm.</summary>
public sealed class AppModuleLayoutRulesTests : ModuleLayoutRulesBase
{
    /// <summary>Phía module được quét: <c>"App"</c> = module phần mềm (<c>App.Modules.*</c>); mã phần mềm suy từ tên assembly <c>App.Tests.PMS</c>.</summary>
    protected override string Side => "App";

    // PMS không có module sandbox App.Modules.Test nên không có miễn trừ nào: mọi module của phần mềm phải có cả Domain lẫn Persistence.
    protected override IReadOnlyDictionary<string, string> MienTruDomainPersistence { get; } = new Dictionary<string, string>();
}

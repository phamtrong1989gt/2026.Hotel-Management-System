# App.Tests.PMS — gate kiến trúc + test hạ tầng

Chạy (ở thư mục repo phần mềm): `dotnet test BE/Tests/App.Tests.PMS/App.Tests.PMS.csproj`. Gate quét mã nguồn nên module sinh sau bị canh tự động (module mới tự vào qua `ProjectComposition.ControllerAssemblies`).

## Hiện có (khung trống)
- `Architecture/AppModuleLayoutRulesTests` — bố cục module (README · `*Module.cs` · `Domain` + `Persistence` đi đôi).
- `Architecture/AppSchemaRulesTests` — bảng nghiệp vụ ở lược đồ `dbo`, khai tường minh. KHÔNG đòi «có bảng» vì khung trống; có bảng đầu tiên thì thêm lại `mappings.Should().NotBeEmpty(...)`.
- `RepoPaths` — đường dẫn gốc cho các gate quét mã (dùng chung với gate sinh thêm sau này).

Lõi (`PTCore.Tests`) còn chạy `MultiAppGateRulesTests` canh MỌI phần mềm của dự án: phải có dự án test này, hai gate trên và `Mappings` hai đối số.

## Thêm gate khi có nghiệp vụ
Các gate chuẩn (`AppApiRules`, `AppLogContentRules`, `AppNamespaceRules`, `AppNullableRules`…) do chuỗi `/gen-module` / `/review` thêm khi module đầu tiên ra đời — khung trống không sinh sẵn vì chúng đòi có mã để quét (0 lời gọi ⇒ đỏ).

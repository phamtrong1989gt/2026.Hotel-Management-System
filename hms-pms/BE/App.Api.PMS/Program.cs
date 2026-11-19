using PTCore.Application;
using PTCore.Host;
using PTCore.Host.Configuration;

namespace App.Api.PMS;

/// <summary>
/// Điểm vào của PHẦN MỀM — mỏng. Khởi động thật (nạp .env, kiểm bí mật, giới hạn Kestrel, chuỗi nguồn cấu hình) nằm ở <see cref="CoreProgram"/>
/// (PTCore.Host, đi theo lõi). Hai hàm công khai bên dưới giữ tên chuẩn cho test dựng host / dựng chuỗi cấu hình.
/// </summary>
public class Program
{
    /// <summary>
    /// Chế độ triển khai MẶC ĐỊNH của phần mềm PMS: <c>Linked</c> — đăng nhập và quản trị tài khoản / phân quyền qua máy chủ SSO. Quên khai <c>Deployment__Mode</c> trên máy chủ thì phần mềm rơi về phía HẠN CHẾ (không mở quản trị tài khoản), không rơi về <c>Standalone</c>; máy dev muốn chạy đứng một mình đặt <c>Deployment__Mode=Standalone</c> trong tệp <c>.env</c> cạnh API.
    /// <para>Tiền tố tên cookie mặc định <c>PMS</c> (giá trị MẶC ĐỊNH, coder đổi được): cookie của trình duyệt tách theo TÊN MIỀN chứ không theo cổng, nên mỗi phần mềm một tiền tố riêng để thẻ làm mới,
    /// vé thiết bị tin cậy… không đè cookie của phần mềm khác. <c>Deployment__CookiePrefix</c> khai thì thắng. Đổi tiền tố trên phần mềm đang chạy thì mọi người đang đăng nhập phải đăng nhập lại một lần.</para>
    /// </summary>
    public static readonly HostDeployment Deployment = new(DeploymentMode.Linked, CookiePrefix: "PMS");

    /// <summary>
    /// Hàm làm gì: điểm vào tiến trình — chuyển toàn bộ việc khởi động cho <see cref="CoreProgram.Run{TStartup}"/> với <see cref="Startup"/> của phần mềm và <see cref="Deployment"/>.
    /// Tham số: <paramref name="args"/> — đối số dòng lệnh. Trả về: không. Tác dụng phụ: khởi động web host (chạy tới khi tắt); thiếu cấu hình bắt buộc thì host không khởi động.
    /// </summary>
    /// <param name="args">Đối số dòng lệnh của tiến trình.</param>
    public static void Main(string[] args) => CoreProgram.Run<Startup>(args, Deployment);

    /// <summary>
    /// Hàm làm gì: dựng <see cref="IHostBuilder"/> như app thật nhưng CHƯA chạy — test tích hợp dùng để dựng host.
    /// Tham số: <paramref name="args"/> — đối số dòng lệnh. Trả về: bộ dựng host đã gắn <see cref="Startup"/> và <see cref="Deployment"/>. Tác dụng phụ: không (chưa khởi động).
    /// </summary>
    /// <param name="args">Đối số dòng lệnh.</param>
    /// <returns>Bộ dựng host của phần mềm.</returns>
    public static IHostBuilder CreateWebHostBuilder(string[] args) => CoreProgram.CreateWebHostBuilder<Startup>(args, Deployment);

    /// <summary>
    /// Hàm làm gì: chuỗi nguồn cấu hình của phần mềm — xem <see cref="CoreProgram.ConfigureAppConfiguration"/>.
    /// Tham số: môi trường host, bộ dựng cấu hình, đối số dòng lệnh. Trả về: không. Tác dụng phụ: thêm các nguồn cấu hình (tệp, .env, biến môi trường) vào <paramref name="config"/>.
    /// </summary>
    /// <param name="environment">Môi trường host (Development / Production…).</param>
    /// <param name="config">Bộ dựng cấu hình sẽ được thêm nguồn.</param>
    /// <param name="args">Đối số dòng lệnh.</param>
    public static void ConfigureAppConfiguration(IHostEnvironment environment, IConfigurationBuilder config, string[] args)
        => CoreProgram.ConfigureAppConfiguration(environment, config, args, Deployment);
}

---
description: "New-project: dựng MỘT DỰ ÁN MỚI chuẩn format với 1..n phần mềm ở dạng KHUNG RỖNG — thư mục dự án (workspace.json · slnx · props mỏng · scripts cổng kiểm · docs · services-config) + mỗi repo phần mềm (app.yaml · host App.Api · module · test · FE vỏ · _contracts · doc · script SQL bảng adm sinh sẵn). Đường dẫn TƯƠNG ĐỐI (clone về máy khác không lỗi), build xanh, CHƯA có model / controller / module nghiệp vụ. Gõ `/new-project` rồi Enter, trả lời từng câu (dựng dự án mới HOẶC thêm phần mềm vào dự án có sẵn; có mặc định, gõ tắt được), hiện bản xem trước, CHỜ dev «ok» mới tạo. Chỉ THÊM, KHÔNG ghi CSDL / không đăng ký SSO / không chạy SQL. Cũng THÊM phần mềm vào dự án ĐÃ dựng (`--them-vao`): tạo repo mới + chỉ thêm dòng ở workspace.json / solution / config-manifest / bảng cổng, không đụng phần mềm cũ."
argument-hint: "(bỏ trống = hỏi từng câu) [<Tên dự án>] [--ma=A07] [--goc=\"<thư mục gốc>\"] [--them-vao=\"<thư mục dự án có sẵn>\"] [--pm=\"MÃ|Tên|thư mục|Linked|thư mục SRS\"]… [--loi=\"<thư mục lõi>\"] [--khoi-cong=57] [--khong-sql] [--kiem-chung] [--chi-xem]"
---

Đọc và thực thi đầy đủ hướng dẫn tại `_bmad/custom/prompts/new-project.prompt.md`.

$ARGUMENTS

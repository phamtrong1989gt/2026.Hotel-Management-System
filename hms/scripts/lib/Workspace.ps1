# Workspace.ps1 - cho noi DUNG CHUNG cua cong cu PowerShell cap DU AN biet "kho ma" nay gom NHIEU thu muc (tach kho 2026-11-18).
# Tep nay PHAI thuan ASCII (PowerShell 5.1 doc UTF-8 khong BOM thanh ANSI). Dung: dot-source roi goi ham:
#   . (Join-Path $PSScriptRoot 'lib\Workspace.ps1')        # tu scripts\<tep>.ps1
#   $real  = Resolve-LogicalPath 'src\Apps\<Ma>\BE\App.Api.<Ma>\.env'   # duong dan LOGIC (kho gop cu) -> duong dan THAT
#   $logic = ConvertTo-LogicalPath $real                                  # nguoc lai (de in bao cao / khop khoa); khong thuoc thu muc nao -> $null
#   $apps  = Get-WsApps                                                   # cac phan mem cua du an: Code, RepoRoot, Be, Fe, Contracts
# Quy tac dich (cung quy tac voi scripts\lib\workspace.mjs va PTCore.Tests.WorkspaceLayout - ba ban PHAI nhan dien giong nhau):
#   src\Apps\<Ma>\...            -> repo phan mem (<repo>\...)           vd src\Apps\<Ma>\BE\x = <thu muc repo cua phan mem>\BE\x
#   src\Core|Services\... va _bmad\... -> loi nen tang (src\ cua loi / _bmad)
#   scripts|docs|deploy|services-config|... -> thu muc du an (khong co o du an thi thu loi)
# Goc la thu muc DU AN (chua workspace.json) thi moi dich; goc LA (kho gia cua ca pha / tu kiem) thi noi thang nhu cu; chay trong KHO GOP CU
# (khong co workspace.json) thi moi ham thanh phep noi thang - cung mot bo script chay duoc o ca hai bo cuc.

# Thu muc du an suy tu vi tri tep nay: scripts\lib -> scripts -> <du an>.
$script:WsProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:WsContext = $null   # bo nho dem cua Get-WsContext (doc workspace.json mot lan moi tien trinh)

# Ham lam gi: bo chu thich dong (//), chu thich khoi (/* */) va dau phay thua khoi JSON (workspace.json do nguoi viet tay), giu nguyen noi dung trong chuoi.
# Tham so: $Text - noi dung JSON co the kem chu thich. Tra ve: JSON thuan (chuoi). Tac dung phu: khong.
function Remove-WsJsonComments([string]$Text) {
  $sb = New-Object System.Text.StringBuilder
  $inStr = $false
  for ($i = 0; $i -lt $Text.Length; $i++) {
    $c = $Text[$i]
    $n = if ($i + 1 -lt $Text.Length) { $Text[$i + 1] } else { [char]0 }
    if ($inStr) {
      [void]$sb.Append($c)
      if ($c -eq '\') { if ($i + 1 -lt $Text.Length) { [void]$sb.Append($n); $i++ } }
      elseif ($c -eq '"') { $inStr = $false }
      continue
    }
    if ($c -eq '"') { $inStr = $true; [void]$sb.Append($c); continue }
    if ($c -eq '/' -and $n -eq '/') { while ($i -lt $Text.Length -and $Text[$i] -ne "`n") { $i++ }; [void]$sb.Append("`n"); continue }
    if ($c -eq '/' -and $n -eq '*') { $i += 2; while ($i + 1 -lt $Text.Length -and -not ($Text[$i] -eq '*' -and $Text[$i + 1] -eq '/')) { $i++ }; $i++; continue }
    [void]$sb.Append($c)
  }
  return [regex]::Replace($sb.ToString(), ',(\s*[}\]])', '$1')
}

# Ham lam gi: chuan hoa duong dan de SO SANH (tuyet doi, bo dau phan cach cuoi, Windows khong phan biet hoa thuong).
# Tham so: $Path - duong dan bat ky. Tra ve: chuoi so sanh duoc. Tac dung phu: khong (khong cham dia).
function Get-WsPathKey([string]$Path) {
  return ([System.IO.Path]::GetFullPath($Path)).TrimEnd('\', '/').ToLowerInvariant()
}

# Ham lam gi: phan tuong doi (dau '/') cua $Full duoi $Base; rong neu chinh $Base; $null neu $Full khong nam duoi $Base.
# Tham so: $Base - thu muc goc; $Full - duong dan can xet. Tra ve: chuoi hoac $null. Tac dung phu: khong.
function Get-WsRelUnder([string]$Base, [string]$Full) {
  $b = Get-WsPathKey $Base
  $f = Get-WsPathKey $Full
  if ($f -eq $b) { return '' }
  if ($f.StartsWith($b + '\')) {
    $realFull = ([System.IO.Path]::GetFullPath($Full)).TrimEnd('\', '/')
    return ($realFull.Substring($b.Length + 1) -replace '\\', '/')
  }
  return $null
}

# Ham lam gi: noi $Base voi cac doan $Parts (mang) ma khong loi khi mang rong. Tham so: $Base; $Parts mang doan. Tra ve: duong dan. Tac dung phu: khong.
function Join-WsParts([string]$Base, [string[]]$Parts) {
  $p = @($Parts | Where-Object { $_ })
  if ($p.Count -eq 0) { return $Base }
  return Join-Path $Base ($p -join '\')
}

# Ham lam gi: doc workspace.json cua du an va nhan dien loi / phan mem; ket qua duoc nho (bo nho dem).
# Tra ve: doi tuong { Split (bool: bo cuc TACH), ProjectRoot, PlatformRoot, SrcRoot, Apps[ {Code, RepoRoot, Be, Fe, Contracts} ] }; Split = $false khi khong co workspace.json (kho gop cu: moi ham noi thang).
# Nem loi khi co workspace.json ma khong tim thay loi nen tang (thu platform.local.props, bien PLATFORM_ROOT, workspace.json -> platform.path; KHONG co mac dinh cung; hop le khi co src\Core\Framework) - liet ke tung noi da thu + cach sua.
# Tac dung phu: doc tep workspace.json (chi doc).
function Get-WsContext {
  if ($null -ne $script:WsContext) { return $script:WsContext }
  $root = $script:WsProjectRoot
  $wsFile = Join-Path $root 'workspace.json'
  if (-not (Test-Path $wsFile)) {
    $script:WsContext = [pscustomobject]@{ Split = $false; ProjectRoot = $root; PlatformRoot = $null; SrcRoot = (Join-Path $root 'src'); Apps = @() }
    return $script:WsContext
  }
  # Cong cu cap du an luon thuoc dung MOT du an (thu muc chua cac script nay). PTCORE_PROJECT_ROOT dat ma tro du an KHAC => LOI ngay (cung quy tac voi workspace.mjs).
  if (([string]$env:PTCORE_PROJECT_ROOT).Trim() -and ((Get-WsPathKey ([string]$env:PTCORE_PROJECT_ROOT).Trim()) -ne (Get-WsPathKey $root))) {
    throw ('PTCORE_PROJECT_ROOT=' + ([string]$env:PTCORE_PROJECT_ROOT).Trim() + ' tro toi du an KHAC voi du an chua cac script nay (' + $root + '). Cong cu cap du an luon chay tren chinh du an cua no: bo bien, hoac chay script o du an kia.')
  }
  $json = (Remove-WsJsonComments ([System.IO.File]::ReadAllText($wsFile).TrimStart([char]0xFEFF))) | ConvertFrom-Json
  # Thu tu nhan dien loi (CUNG voi workspace.mjs va PTCore.Tests.WorkspaceLayout): platform.local.props -> PLATFORM_ROOT -> workspace.json platform.path. KHONG co ung vien mac dinh cung.
  # Directory.Build.props (MSBuild) KHONG doc workspace.json: neu platform.path khac cho Directory.Build.props tro toi, dat them platform.local.props hoac PLATFORM_ROOT de MSBuild thay cung loi.
  $sources = @()
  $localProps = Join-Path $root 'platform.local.props'
  $propsValue = $null
  if (Test-Path $localProps) {
    $pm = [regex]::Match([System.IO.File]::ReadAllText($localProps), '<PlatformRoot[^>]*>\s*([^<]+?)\s*</PlatformRoot>')
    if ($pm.Success) { $propsValue = $pm.Groups[1].Value.Replace('$(MSBuildThisFileDirectory)', $root + '\') }
  }
  $sources += [pscustomobject]@{ Label = 'platform.local.props (<PlatformRoot>)'; Value = $propsValue }
  $sources += [pscustomobject]@{ Label = 'bien moi truong PLATFORM_ROOT'; Value = $env:PLATFORM_ROOT }
  $wsValue = $null
  if ($json.platform -and $json.platform.path) { $wsValue = [System.IO.Path]::Combine($root, [string]$json.platform.path) }
  $sources += [pscustomobject]@{ Label = 'workspace.json -> platform.path'; Value = $wsValue }
  $platform = $null
  $tried = @()
  foreach ($s in $sources) {
    $c = [string]$s.Value
    if (-not $c -or -not $c.Trim()) { $tried += ($s.Label + ': khong khai'); continue }
    $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $c))
    if (Test-Path (Join-Path $full 'src\Core\Framework')) { $platform = $full; break }
    $tried += ($s.Label + ' = ' + $full + ': khong co src\Core\Framework')
  }
  if (-not $platform) { throw ('Khong tim thay loi nen tang (thu muc co src\Core\Framework) cho du an ' + $root + '. Da thu: ' + ($tried -join '; ') + '. Cach sua: dat platform.path (duong dan toi thu muc loi, tuong doi thu muc du an) trong workspace.json, hoac dat bien moi truong PLATFORM_ROOT, hoac tao platform.local.props co <PlatformRoot> (rieng tung may, khong commit).') }
  $repoPaths = @{}
  if ($json.repos) { foreach ($p in $json.repos.PSObject.Properties) { if ($p.Value.path) { $repoPaths[$p.Name] = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, [string]$p.Value.path)) } } }
  $apps = @()
  $missing = @()
  foreach ($item in @($json.apps)) {
    if (-not $item -or -not $item.code -or -not $item.repo -or -not $repoPaths.ContainsKey([string]$item.repo)) { continue }
    $repoRoot = $repoPaths[[string]$item.repo]
    if (-not (Test-Path $repoRoot)) { $missing += ([string]$item.code + ' (' + $repoRoot + ')'); continue }   # repo chua clone: ghi lai de bao LOI (xem duoi), khong bo qua lang le
    $be = if ($item.be) { [string]$item.be } else { 'BE' }
    $fe = if ($item.fe) { [string]$item.fe } else { 'FE' }
    $ct = if ($item.contracts) { [string]$item.contracts } else { '_contracts' }
    $apps += [pscustomobject]@{ Code = [string]$item.code; RepoRoot = $repoRoot; Be = $be; Fe = $fe; Contracts = $ct }
  }
  $apps = @($apps | Sort-Object Code)
  # Phan mem khai trong workspace.json ma repo chua co tren may: cong quet se bo sot chung va van XANH (xanh gia) => NEM LOI (cung quy tac voi assertAppsComplete cua workspace-layout.mjs).
  # Cho qua khi dat bien PTCORE_ALLOW_MISSING_APPS=1 (hoac true) - dev chu y chi lam mot phan mem.
  if ($missing.Count -gt 0 -and ([string]$env:PTCORE_ALLOW_MISSING_APPS).Trim() -notmatch '^(1|true)$') {
    throw ('workspace.json (' + $root + ') khai ' + $missing.Count + ' phan mem ma repo CHUA co tren may nay: ' + ($missing -join '; ') + '. Cac cong quet se bo sot chung va van bao xanh - nen dung o day. Clone repo con thieu ve dung duong dan tren, hoac neu chu y chi lam mot phan mem thi dat PTCORE_ALLOW_MISSING_APPS=1.')
  }
  $script:WsContext = [pscustomobject]@{ Split = $true; ProjectRoot = $root; PlatformRoot = $platform; SrcRoot = (Join-Path $platform 'src'); Apps = $apps }
  return $script:WsContext
}

# Ham lam gi: $Root co phai goc DU AN da biet (nen dich logic -> that) khong - bo cuc tach VA $Root la thu muc du an; goc la thi noi thang.
# Tham so: $Root - goc kho nghi ngo. Tra ve: bool. Tac dung phu: doc workspace.json (qua Get-WsContext).
function Test-WsKnownRoot([string]$Root) {
  $ctx = Get-WsContext
  return ($ctx.Split -and ((Get-WsPathKey $Root) -eq (Get-WsPathKey $ctx.ProjectRoot)))
}

# Ham lam gi: duong dan THAT cua mot duong dan LOGIC tinh tu goc kho gop cu (dau '\' hoac '/'). Thay cho Join-Path $repoRoot '<logic>'.
# Tham so: $Logical - vd 'src\Apps\<Ma>\BE\x'; $Root - goc kho dang dung (mac dinh: thu muc du an; goc du an => dich, goc la => noi thang).
# Tra ve: duong dan tuyet doi theo dau phan cach Windows (chua bao dam ton tai). Tac dung phu: doc workspace.json va Test-Path (khi can chon giua du an / loi cho duong dan khong bat dau bang src).
function Resolve-LogicalPath([Parameter(Mandatory = $true)][string]$Logical, [string]$Root) {
  $ctx = Get-WsContext
  if (-not $Root) { $Root = $ctx.ProjectRoot }
  $parts = @((($Logical -replace '\\', '/').Trim('/')) -split '/' | Where-Object { $_ })
  if (-not (Test-WsKnownRoot $Root)) { return Join-WsParts $Root $parts }
  if ($parts.Count -gt 0 -and $parts[0] -eq 'src') {
    $rest = @(); if ($parts.Count -gt 1) { $rest = @($parts[1..($parts.Count - 1)]) }
    if ($rest.Count -ge 2 -and $rest[0] -eq 'Apps') {
      $app = @($ctx.Apps | Where-Object { $_.Code -eq $rest[1] }) | Select-Object -First 1
      if ($app) { $tail = @(); if ($rest.Count -gt 2) { $tail = @($rest[2..($rest.Count - 1)]) }; return Join-WsParts $app.RepoRoot $tail }
    }
    return Join-WsParts $ctx.SrcRoot $rest
  }
  foreach ($base in @($ctx.ProjectRoot, $ctx.PlatformRoot)) {
    if (-not $base) { continue }
    $p = Join-WsParts $base $parts
    if (Test-Path $p) { return $p }
  }
  return Join-WsParts $ctx.ProjectRoot $parts
}

# Ham lam gi: duong dan LOGIC (dau '/') cua mot duong dan tuyet doi that - nguoc cua Resolve-LogicalPath. Thu tu: phan mem -> loi -> du an.
# Tham so: $Path - duong dan tuyet doi; $Root - goc kho dang dung (goc la => tinh tuong doi $Root).
# Tra ve: chuoi logic (chinh goc => '.'), hoac $null khi nam ngoai moi thu muc cua du an / loi / phan mem. Tac dung phu: khong (khong cham dia ngoai workspace.json).
function ConvertTo-LogicalPath([Parameter(Mandatory = $true)][string]$Path, [string]$Root) {
  $ctx = Get-WsContext
  if (-not $Root) { $Root = $ctx.ProjectRoot }
  if (-not (Test-WsKnownRoot $Root)) {
    $r = Get-WsRelUnder $Root $Path
    if ($null -eq $r) { return $null }
    if ($r -eq '') { return '.' }
    return $r
  }
  foreach ($app in $ctx.Apps) {
    $r = Get-WsRelUnder $app.RepoRoot $Path
    if ($null -ne $r) { if ($r -eq '') { return 'src/Apps/' + $app.Code } else { return 'src/Apps/' + $app.Code + '/' + $r } }
  }
  foreach ($base in @($ctx.PlatformRoot, $ctx.ProjectRoot)) {
    if (-not $base) { continue }
    $r = Get-WsRelUnder $base $Path
    if ($null -ne $r) { if ($r -eq '') { return '.' } else { return $r } }
  }
  return $null
}

# Ham lam gi: danh sach phan mem cua du an - nguon de liet ke "src\Apps\*" khi goc la du an (bo cuc tach doc tu workspace.json; kho gop cu liet ke thu muc con cua src\Apps).
# Tham so: $Root - goc kho dang dung (mac dinh: thu muc du an). Tra ve: mang {Code, RepoRoot, Be, Fe, Contracts} sap theo ma (RepoRoot o kho gop = <goc>\src\Apps\<Ma>; Be/Fe/Contracts mac dinh BE/FE/_contracts); rong neu khong co.
# Tac dung phu: doc thu muc (chi doc).
function Get-WsApps([string]$Root) {
  $ctx = Get-WsContext
  if (-not $Root) { $Root = $ctx.ProjectRoot }
  if (Test-WsKnownRoot $Root) { return @($ctx.Apps) }
  $dir = Join-Path $Root 'src\Apps'
  if (-not (Test-Path $dir)) { return @() }
  return @(Get-ChildItem -Path $dir -Directory | Sort-Object Name | ForEach-Object { [pscustomobject]@{ Code = $_.Name; RepoRoot = $_.FullName; Be = 'BE'; Fe = 'FE'; Contracts = '_contracts' } })
}

# Thiết lập release, cập nhật app và website

Đợt này dùng **repo public có sẵn `sung2708/goide`**. `main` chứa source của bản release; tag `v0.2.0-alpha.1` trỏ tới đúng commit trên main. `gh-pages` là nhánh dữ liệu cập nhật, không phải nhánh source. Không cần tạo repo khác hoặc PAT cho cấu hình cùng repo.

Đây là alpha thử nghiệm do maintainer yêu cầu phát hành. Các giới hạn QA được công bố trong [release notes](releases/v0.2.0-alpha.1.md); kết quả audit NOT READY trước đó vẫn được giữ. Tag/pipeline đã chạy không đồng nghĩa installer đã xuất bản hoặc signed upgrade đã được kiểm chứng.

## 1. Tạo signing key trên máy của bạn

Chạy trong thư mục goide:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tauri"
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\goro.key"
```

Nhập mật khẩu khi CLI yêu cầu. Giữ bản sao `goro.key`, `goro.key.pub` và mật khẩu ở nơi lưu trữ riêng của bạn. Không dùng `--force` để ghi đè identity của app đã phát hành. Nội dung file `.pub` là public key, nội dung file `.key` và mật khẩu là secrets. Các bản cập nhật sau dùng cùng identity này. Không commit private key hoặc mật khẩu vào source.

Hướng dẫn chính thức: [Tauri updater signing](https://v2.tauri.app/plugin/updater/).

## 2. Cấu hình repo goide

Mở [Actions variables](https://github.com/sung2708/goide/settings/variables/actions). Tạo các **Repository variables**:

| Tên | Giá trị |
| --- | --- |
| `GORO_RELEASE_REPOSITORY` | `sung2708/goide` (cũng là mặc định nếu để trống) |
| `GORO_RELEASE_BASE_URL` | `https://sung2708.github.io/goide/channels/` |
| `GORO_UPDATER_PUBLIC_KEY` | Toàn bộ nội dung file `goro.key.pub`, giữ nguyên dạng base64 do Tauri tạo |

`GORO_SIGNING_PUBLIC_KEY` để trống: tự dùng updater public key. Nó chỉ cần khi thực hiện quy trình đổi identity có bridge release.

Mở [Environments](https://github.com/sung2708/goide/settings/environments). Tạo environment **release-signing** và thêm hai environment secrets:

| Tên | Giá trị |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Toàn bộ nội dung file `goro.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mật khẩu đã đặt ở bước 1 |

Tạo environment **release-distribution**. Cấu hình cùng repo không cần secret `GORO_RELEASE_TOKEN`: job publish dùng `GITHUB_TOKEN` với `contents: write`; các job kiểm tra/build giữ quyền đọc. Nếu đặt deployment branch/tag rules cho hai environment, cho phép branch `main` và tag `v*`. Nếu cấu hình required reviewers, cần duyệt deployment thì job mới tiếp tục.

Updater signature không phải Authenticode hoặc Developer ID notarization. Alpha hiện chưa tuyên bố đã kiểm chứng platform trust. Không đánh dấu stable chỉ vì build thành công.

## 3. Bật Pages cho metadata

Mở [Settings → Pages](https://github.com/sung2708/goide/settings/pages). Trong **Build and deployment → Source**, chọn **GitHub Actions**.

Pipeline Release có job `deploy-metadata`: sau khi upload và kiểm tra public bytes/checksums thành công, publisher ghi các JSON vào `gh-pages`; job Pages deploy chúng. Việc deploy tường minh là cần thiết vì push bằng `GITHUB_TOKEN` không tự kích hoạt branch-based Pages build. Environment `github-pages` cần cho phép tag `v*` và branch `main` nếu bạn đặt rules.

Nguồn chính thức: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Sau alpha release, hai endpoint cần trả HTTP 200 với JSON thật:

- App: `https://sung2708.github.io/goide/channels/alpha/latest.json`
- Web: `https://sung2708.github.io/goide/channels/alpha/release.json`

Các feed `beta` và `stable` chỉ xuất hiện sau release phù hợp; alpha không cập nhật feed stable. Đây là URL cấu hình mục tiêu, chưa phải bằng chứng endpoint đã được deploy.

## 4. Chạy lại pipeline đã gắn tag

Mở [Actions → Release](https://github.com/sung2708/goide/actions/workflows/release.yml). Chọn run cho **v0.2.0-alpha.1** và **Re-run all jobs** sau khi hoàn thành cấu hình. Không xóa/recreate tag để thay source. Nếu có environment review đang chờ, duyệt đúng commit của tag.

Thứ tự: kiểm tra main/tag/version → build/test/sign bốn target → verify tám payload cùng signature/checksum → draft/upload → public byte verification → ghi metadata cuối cùng → deploy Pages. Chỉ sau tất cả job thành công và endpoint đã lên mới coi distribution hoàn tất.

Nếu GitHub Release đã tồn tại sau một lỗi publish, không rerun mù quáng: publisher từ chối thay asset của version đã công bố. Kiểm tra draft/public state và phục hồi có chủ đích hoặc tạo version mới. Nếu chỉ `deploy-metadata` lỗi sau khi publication đã thành công, dùng **Re-run failed jobs** để tránh chạy lại publisher.

## 5. Cấu hình web goide_web

Trong GitHub repo goide_web và/hoặc phần environment của dịch vụ đang host web, đặt:

```text
VITE_RELEASE_METADATA_URL=https://sung2708.github.io/goide/channels/alpha/release.json
VITE_RELEASE_DEV_FIXTURE=false
```

`VITE_RELEASE_INDEX_URL` để trống: changelog dùng release mới nhất và kiểm chứng published release/tag thuộc main. `VITE_SITE_URL` là origin HTTPS của website thực tế, nếu đã có. Không đặt private key hoặc GitHub token trong biến VITE.

Website checks đọc GitHub repository variables và xuất artifact `goro-website-<SHA>` chứa `dist/`. Nếu host bằng Vercel/Cloudflare/Netlify, đặt biến ở host, dùng branch production `main`, build `npm ci && npm run build`, output `dist`; bật SPA fallback về index.html cho `/download`, `/docs`, `/changelog`, `/security`. Build artifact trong Actions không tự triển khai vào một host chưa được kết nối.

Cấu hình endpoint rồi build/deploy web một lần. Các app release sau cập nhật JSON tại cùng URL; web đọc lại khi tải trang, khi refresh, khi quay lại từ bfcache và mỗi 5 phút khi trang đang hiện. Không cần sửa source hoặc redeploy web cho mỗi app version. Changelog lấy notes của published release trên main, không đưa commit develop lên web.

## 6. Kiểm tra cập nhật thật

App alpha mặc định chọn alpha; auto-check mặc định bật, chạy sau khoảng 8 giây và cache lần check thành công 24 giờ cho mỗi installed version/channel. Dùng **Goro: Check for Updates** để kiểm tra thủ công. Auto-download mặc định tắt; install/restart luôn cần người dùng đồng ý và bảo vệ buffer/process trước khi cài.

Bản đầu tiên cần cài thủ công. Các bản dev cũ không có production key/base trong binary không thể tự cập nhật chỉ bằng việc bật Actions. Để thử upgrade, cài alpha.1, phát hành alpha.2 đã ký bằng cùng key, rồi kiểm tra download/cancel/dirty-buffer consent/install/restart trên app đã cài.

Sau khi website có origin thực tế, chạy probe từ repo goide:

```powershell
node scripts/check-distribution-endpoint.mjs --base-url https://sung2708.github.io/goide/channels/ --website-origin https://YOUR-ACTUAL-WEBSITE --channel alpha
```

Thay origin bằng website thật. Probe kiểm tra metadata, CORS/cache và asset availability; nó không thay thế test installer hoặc native signed upgrade. Tài liệu chi tiết: [Updates](UPDATES.md), [Release runbook](RELEASE.md).

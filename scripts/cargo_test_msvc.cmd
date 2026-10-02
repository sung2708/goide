@echo off
setlocal
call "%~dp0init_msvc.cmd"
if errorlevel 1 exit /b 1
cd /d "%~dp0..\src-tauri"
cargo test %*
exit /b %errorlevel%

@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64
cd /d C:\Users\t15\Training\goide\src-tauri
set CC=cl
set CXX=cl
set HOST_CC=cl
set HOST_CXX=cl
where cl
cargo check

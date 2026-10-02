@echo off
rem Called by build helpers in the same cmd.exe environment.
set "GOIDE_VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%GOIDE_VSWHERE%" (
    echo MSVC Build Tools discovery failed: install Visual Studio with C++ tools. 1>&2
    exit /b 1
)
set "GOIDE_VS_INSTALL="
for /f "usebackq tokens=*" %%i in (`"%GOIDE_VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "GOIDE_VS_INSTALL=%%i"
if not defined GOIDE_VS_INSTALL (
    echo No MSVC C++ toolchain found. Install the Desktop development with C++ workload. 1>&2
    exit /b 1
)
call "%GOIDE_VS_INSTALL%\Common7\Tools\VsDevCmd.bat" -no_logo -arch=x64 -host_arch=x64
if errorlevel 1 exit /b 1
set "CC=cl"
set "CXX=cl"
set "HOST_CC=cl"
set "HOST_CXX=cl"
exit /b 0

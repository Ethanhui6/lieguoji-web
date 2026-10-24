@echo off
chcp 65001 >nul
title 列国纪 电脑计算
cd /d "%~dp0"
echo 正在准备与正式站相同版本的游戏文件……
call git pull --ff-only
call npm run build >nul
if errorlevel 1 (echo 构建失败，请把这个窗口截图发给 Claude。& pause & exit /b 1)
node scripts\host.mjs --tunnel %*
pause

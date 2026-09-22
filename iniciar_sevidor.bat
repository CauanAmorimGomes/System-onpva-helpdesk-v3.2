@echo off
chcp 65001 >nul
title Inova+ Helpdesk - Servidor
cd /d "%~dp0"

echo.
echo  ==========================================
echo    Inova+ Helpdesk - Servidor PHP local
echo  ==========================================
echo.

where php >nul 2>nul
if errorlevel 1 (
  if exist "C:\xampp\php\php.exe" (
    set "PHP=C:\xampp\php\php.exe"
  ) else (
    echo  [ERRO] PHP nao encontrado.
    echo.
    echo  Instale o PHP 8.1+ ^(https://windows.php.net/download^)
    echo  ou o XAMPP ^(https://www.apachefriends.org^) e rode de novo.
    echo.
    pause
    exit /b 1
  )
) else (
  set "PHP=php"
)

"%PHP%" -r "exit(version_compare(PHP_VERSION,'8.1.0','<')?1:0);"
if errorlevel 1 (
  echo  [ERRO] E necessario PHP 8.1 ou superior. Versao encontrada:
  "%PHP%" -v
  pause
  exit /b 1
)

echo  Servidor rodando em: http://localhost:8000
echo  Deixe esta janela aberta. Para parar: Ctrl+C
echo.
start "" "http://localhost:8000/index.html"
"%PHP%" -S localhost:8000 -d upload_max_filesize=10M -d post_max_size=55M
pause
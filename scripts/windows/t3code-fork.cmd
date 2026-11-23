@echo off
rem T3 Code (fork n1ghtmare-dev): checks for an update, rebuilds when the code changed, then starts.
rem git pull can rewrite this file, and cmd reads a running script from disk line by line,
rem so the launcher first hands over to a copy in %TEMP%.
rem The app's tray runs it with --wait-pid <pid> to update and restart after it quits.
if /i not "%~1"=="--from-temp" (
  copy /y "%~f0" "%TEMP%\t3code-fork-launch.cmd" >nul
  "%TEMP%\t3code-fork-launch.cmd" --from-temp "%~dp0" %*
  exit /b
)
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
set "REPO=%~f2..\.."
set "BRANCH=feature/multi-window"
set "FORKHOME=%USERPROFILE%\.t3-fork"
title T3 Code (fork)

set "WAITPID="
if /i "%~3"=="--wait-pid" set "WAITPID=%~4"
if not defined WAITPID goto :afterwait
echo Жду, пока T3 Code закроется...
:waitloop
tasklist /FI "PID eq %WAITPID%" 2>nul | "%SystemRoot%\System32\find.exe" "%WAITPID%" >nul
if not errorlevel 1 (
  ping -n 2 127.0.0.1 >nul
  goto :waitloop
)
:afterwait

call :findtools
where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node ^(Vite+^). Запустите install-t3code-fork.bat ещё раз.
  pause
  exit /b 1
)
cd /d "%REPO%" || exit /b 1
set "REPO=%CD%"

rem ---------- Проверка обновления ----------
set "NEEDBUILD=0"
if not exist "apps\desktop\dist-electron\main.cjs" set "NEEDBUILD=1"
rem A running app (for example in the tray) keeps its files: rebuilding under it would break it.
rem It updates itself from the tray instead, so just bring its window up.
if not defined WAITPID (
  powershell -NoProfile -Command "if (Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ('%REPO%' + '\*') }) { exit 0 } else { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :launch
)
rem Source builds leave T3 Connect off without .env; .env.example holds the same public ids as
rem official builds. Creating it needs a rebuild so the app picks them up.
if not exist ".env" if exist ".env.example" (
  copy /y ".env.example" ".env" >nul
  set "NEEDBUILD=1"
)
where git >nul 2>nul
if errorlevel 1 goto :launch
echo Проверяю обновления...
git fetch -q origin %BRANCH% 2>nul
if errorlevel 1 (
  echo Нет связи с GitHub, запускаю текущую версию.
  goto :maybebuild
)
for /f %%H in ('git rev-parse HEAD') do set "OLD=%%H"
for /f %%H in ('git rev-parse FETCH_HEAD') do set "NEW=%%H"
if "!OLD!"=="!NEW!" goto :maybebuild
git merge-base --is-ancestor HEAD FETCH_HEAD
if errorlevel 1 (
  echo В папке программы есть свои изменения, автообновление пропущено.
  goto :maybebuild
)
echo Найдено обновление, устанавливаю...
git merge -q --ff-only FETCH_HEAD || goto :maybebuild
set "NEEDBUILD=1"
rem Зависимости ставятся заново, только если они поменялись.
git diff --name-only !OLD! HEAD | findstr /i /r "pnpm-lock.yaml package.json pnpm-workspace.yaml" >nul
if not errorlevel 1 (
  echo Обновляю зависимости...
  call vp i
  if errorlevel 1 call vp i
)

:maybebuild
if "!NEEDBUILD!"=="1" (
  echo Собираю новую версию, это несколько минут...
  call vp run build:desktop
  if errorlevel 1 (
    echo Сборка не удалась. Пришлите текст ошибки выше.
    pause
    exit /b 1
  )
)

:launch
rem Свои данные отдельно от официального T3 Code; без автообновления до официальной версии.
set T3CODE_DISABLE_AUTO_UPDATE=1
set "T3CODE_HOME=%FORKHOME%"
rem Turns on the tray icon, updates from the tray and reopening windows after a restart.
set "T3CODE_FORK_REPO=%REPO%"
cd /d "%REPO%\apps\desktop"
rem Официальный T3 Code должен быть закрыт: у них общий профиль окна.
start "T3 Code" /min cmd /c "node scripts\start-electron.mjs"
exit /b 0

:findtools
for %%B in ("%LOCALAPPDATA%\vite-plus\bin" "%USERPROFILE%\.vite-plus\bin" "%APPDATA%\vite-plus\bin" "%ProgramFiles%\Git\cmd" "%LOCALAPPDATA%\Programs\Git\cmd" "%LOCALAPPDATA%\t3code-mingit\cmd") do (
  if exist "%%~B\vp.exe" set "PATH=%%~B;!PATH!"
  if exist "%%~B\git.exe" set "PATH=%%~B;!PATH!"
)
exit /b 0

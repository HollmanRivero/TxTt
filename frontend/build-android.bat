@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  build-android.bat  -  TxTt-Android (Capacitor) APK-bygg
REM  Legg i PROSJEKTROTEN (samme mappe som package.json + android\).
REM  Ordner Java (JDK) OG Android SDK automatisk - kan ogsaa
REM  installere JDK for deg via winget hvis den mangler.
REM  Resultat:  apk-output\TxTt-debug.apk
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/5] Bygger web-appen (vite build)...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [2/5] Synker til Android (cap sync)...
call npx cap sync android
if errorlevel 1 goto :fail

echo.
echo [3/5] Forbereder Java (JDK)...

REM En JAVA_HOME som peker paa en slettet installasjon (f.eks. etter
REM Windows-reinstallasjon) skal ignoreres, ikke stoppe bygget.
if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" (
  echo Merk: JAVA_HOME peker paa noe som ikke finnes - ignorerer den.
  set "JAVA_HOME="
)

call :find_jdk

if not defined JAVA_HOME (
  echo.
  echo Fant ingen Java/JDK paa maskinen.
  echo Jeg kan installere Microsoft OpenJDK 21 automatisk med winget.
  set /p SVAR="Installere JDK 21 naa? (J/N): "
  if /i "!SVAR!"=="J" (
    winget install --id Microsoft.OpenJDK.21 -e --accept-source-agreements --accept-package-agreements
    call :find_jdk
  )
)

if not defined JAVA_HOME (
  echo FEIL: Fortsatt ingen JDK. Installer Android Studio
  echo   ^(https://developer.android.com/studio^) - den har JDK innebygd -
  echo   eller kjor: winget install Microsoft.OpenJDK.21
  goto :fail
)
echo Bruker JAVA_HOME=!JAVA_HOME!
set "PATH=!JAVA_HOME!\bin;!PATH!"

echo.
echo [4/5] Sjekker Android SDK (local.properties)...

REM En local.properties fra foer reinstallasjonen kan peke paa en SDK
REM som ikke finnes lenger - da maa den skrives paa nytt.
if exist "android\local.properties" (
  set "SDK_DIR="
  for /f "usebackq tokens=1,* delims==" %%A in ("android\local.properties") do (
    if /i "%%A"=="sdk.dir" set "SDK_DIR=%%B"
  )
  if defined SDK_DIR (
    set "SDK_CHK=!SDK_DIR:/=\!"
    set "SDK_CHK=!SDK_CHK:\:=:!"
    if exist "!SDK_CHK!\platform-tools" (
      echo local.properties peker paa gyldig SDK - bruker den.
      goto :sdk_ok
    )
  )
  echo local.properties peker paa en SDK som ikke finnes - lager ny.
  del "android\local.properties"
)

call :find_sdk
if not defined ANDROID_SDK (
  echo FEIL: Fant ikke Android SDK.
  echo   Installer Android Studio ^(https://developer.android.com/studio^),
  echo   aapne den en gang og la SDK Manager installere standardkomponentene.
  echo   SDK-en havner normalt i: %%LOCALAPPDATA%%\Android\Sdk
  goto :fail
)
set "SDK_FWD=!ANDROID_SDK:\=/!"
> "android\local.properties" echo sdk.dir=!SDK_FWD!
echo Skrev android\local.properties -^> sdk.dir=!SDK_FWD!

:sdk_ok

echo.
echo [5/5] Bygger APK med Gradle (assembleDebug)...
if not exist "android\gradlew.bat" (
  echo FEIL: Fant ikke android\gradlew.bat - kjor evt: npx cap add android
  goto :fail
)
cd android
call gradlew.bat assembleDebug
if errorlevel 1 ( cd .. & goto :fail )
cd ..

set "APK_SRC=android\app\build\outputs\apk\debug\app-debug.apk"
if not exist "%APK_SRC%" (
  echo FEIL: Fant ikke APK-en paa: %APK_SRC%
  goto :fail
)
if not exist "apk-output" mkdir "apk-output"
copy /y "%APK_SRC%" "apk-output\TxTt-debug.apk" >nul

echo.
echo ============================================================
echo  FERDIG!
echo  APK (enkel sti):  %~dp0apk-output\TxTt-debug.apk
echo  APK (original):   %~dp0%APK_SRC%
echo ============================================================
echo.
pause
exit /b 0

REM ── Leter etter JDK paa alle vanlige steder ──────────────────
:find_jdk
if defined JAVA_HOME goto :eof
REM Android Studio sin innebygde JDK (vanligste kilde)
for %%J in (
  "%ProgramFiles%\Android\Android Studio\jbr"
  "%ProgramFiles%\Android\Android Studio\jre"
  "%LOCALAPPDATA%\Programs\Android Studio\jbr"
  "%LOCALAPPDATA%\Programs\Android Studio\jre"
) do (
  if not defined JAVA_HOME if exist "%%~J\bin\java.exe" set "JAVA_HOME=%%~J"
)
if defined JAVA_HOME goto :eof
REM Frittstaaende JDK-er (alle versjoner/leverandoerer, nyeste vinner)
for /d %%D in (
  "%ProgramFiles%\Microsoft\jdk*"
  "%ProgramFiles%\Eclipse Adoptium\jdk*"
  "%ProgramFiles%\Java\jdk*"
  "%ProgramFiles%\Amazon Corretto\jdk*"
) do (
  if exist "%%~D\bin\java.exe" set "JAVA_HOME=%%~D"
)
goto :eof

REM ── Leter etter Android SDK ──────────────────────────────────
:find_sdk
set "ANDROID_SDK="
if defined ANDROID_HOME if exist "%ANDROID_HOME%\platform-tools" set "ANDROID_SDK=%ANDROID_HOME%"
if defined ANDROID_SDK goto :eof
if defined ANDROID_SDK_ROOT if exist "%ANDROID_SDK_ROOT%\platform-tools" set "ANDROID_SDK=%ANDROID_SDK_ROOT%"
if defined ANDROID_SDK goto :eof
if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools" set "ANDROID_SDK=%LOCALAPPDATA%\Android\Sdk"
if defined ANDROID_SDK goto :eof
set "PF86=%ProgramFiles(x86)%"
if exist "%PF86%\Android\android-sdk\platform-tools" set "ANDROID_SDK=%PF86%\Android\android-sdk"
goto :eof

:fail
echo.
echo ============================================================
echo  BYGGET FEILET paa steget over. Les feilteksten ovenfor.
echo  Kopier de siste linjene og lim dem inn i chatten.
echo ============================================================
echo.
pause
exit /b 1

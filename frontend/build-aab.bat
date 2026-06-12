@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM  build-aab.bat  -  TxTt signert AAB for Google Play Console
REM  Legg i PROSJEKTROTEN (samme mappe som build-android.bat).
REM  Foerste gang: lager opplastingsnoekkel (keystore) for deg.
REM  Resultat:  aab-output\TxTt-release.aab
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/6] Bygger web-appen (vite build)...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [2/6] Synker til Android (cap sync)...
call npx cap sync android
if errorlevel 1 goto :fail

echo.
echo [3/6] Forbereder Java (JDK)...
if defined JAVA_HOME if not exist "%JAVA_HOME%\bin\java.exe" set "JAVA_HOME="
call :find_jdk
if not defined JAVA_HOME (
  echo FEIL: Fant ingen JDK. Kjor build-android.bat foerst - den kan installere den.
  goto :fail
)
echo Bruker JAVA_HOME=!JAVA_HOME!
set "PATH=!JAVA_HOME!\bin;!PATH!"

echo.
echo [4/6] Sjekker signeringsnoekkel (keystore)...
if exist "android\key.properties" (
  echo key.properties finnes - bruker eksisterende noekkel.
  goto :sign_ok
)
echo.
echo ============================================================
echo  FOERSTE GANG: Naa lages opplastingsnoekkelen din for Play.
echo  Du blir bedt om aa velge et passord.
echo.
echo  KJEMPEVIKTIG:
echo   1) SKRIV NED passordet i passordbehandleren din
echo   2) TA BACKUP av filen android\upload-keystore.jks et trygt
echo      sted UTENFOR prosjektmappen (minnepinne/skylagring)
echo   3) Noekkelen og passordet skal ALDRI til GitHub
echo ============================================================
echo.
set /p KS_PASS="Velg keystore-passord (minst 6 tegn): "
if "!KS_PASS!"=="" ( echo FEIL: tomt passord & goto :fail )

keytool -genkeypair -v ^
  -keystore "android\upload-keystore.jks" ^
  -alias txtt-upload ^
  -keyalg RSA -keysize 2048 -validity 10000 ^
  -storepass "!KS_PASS!" -keypass "!KS_PASS!" ^
  -dname "CN=TxTt, O=TxTt, C=NO"
if errorlevel 1 goto :fail

(
  echo storeFile=../upload-keystore.jks
  echo storePassword=!KS_PASS!
  echo keyAlias=txtt-upload
  echo keyPassword=!KS_PASS!
) > "android\key.properties"
echo Noekkel laget: android\upload-keystore.jks  (+ key.properties)

:sign_ok

echo.
echo [5/6] Sjekker Android SDK (local.properties)...
if not exist "android\local.properties" (
  if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools" (
    set "SDK_FWD=%LOCALAPPDATA%\Android\Sdk"
    set "SDK_FWD=!SDK_FWD:\=/!"
    > "android\local.properties" echo sdk.dir=!SDK_FWD!
  ) else (
    echo FEIL: Fant ikke Android SDK. Kjor build-android.bat foerst.
    goto :fail
  )
)

echo.
echo [6/6] Bygger signert AAB (bundleRelease)...
cd android
call gradlew.bat bundleRelease
if errorlevel 1 ( cd .. & goto :fail )
cd ..

set "AAB_SRC=android\app\build\outputs\bundle\release\app-release.aab"
if not exist "%AAB_SRC%" (
  echo FEIL: Fant ikke AAB-en paa: %AAB_SRC%
  goto :fail
)
if not exist "aab-output" mkdir "aab-output"
copy /y "%AAB_SRC%" "aab-output\TxTt-release.aab" >nul

echo.
echo ============================================================
echo  FERDIG!
echo  AAB til Play Console:  %~dp0aab-output\TxTt-release.aab
echo.
echo  HUSK: backup av android\upload-keystore.jks + passordet!
echo ============================================================
echo.
pause
exit /b 0

:find_jdk
if defined JAVA_HOME goto :eof
for %%J in (
  "%ProgramFiles%\Android\Android Studio\jbr"
  "%ProgramFiles%\Android\Android Studio\jre"
  "%LOCALAPPDATA%\Programs\Android Studio\jbr"
  "%LOCALAPPDATA%\Programs\Android Studio\jre"
) do (
  if not defined JAVA_HOME if exist "%%~J\bin\java.exe" set "JAVA_HOME=%%~J"
)
if defined JAVA_HOME goto :eof
for /d %%D in (
  "%ProgramFiles%\Microsoft\jdk*"
  "%ProgramFiles%\Eclipse Adoptium\jdk*"
  "%ProgramFiles%\Java\jdk*"
  "%ProgramFiles%\Amazon Corretto\jdk*"
) do (
  if exist "%%~D\bin\java.exe" set "JAVA_HOME=%%~D"
)
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

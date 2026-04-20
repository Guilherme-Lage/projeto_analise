@echo off
title Servidor Hontec Sync
color 0A
echo.
echo  ===================================
echo   ESTOQUE HONTEC - SERVIDOR SYNC
echo  ===================================
echo.

:: Verifica se Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo  ERRO: Node.js nao encontrado!
    echo  Instale em: https://nodejs.org
    pause
    exit
)

:: Instala dependencias se necessario
if not exist node_modules (
    echo  Instalando dependencias...
    npm install express cors
    echo.
)

echo  Iniciando servidor...
echo  Acesse no PC:     http://localhost:4000
echo.
node servidor_sync.js

pause

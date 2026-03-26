@echo off
echo Creating Vite React App...
call npm create vite@latest client -- --template react --yes
cd client
echo Installing dependencies...
call npm install
echo Done.

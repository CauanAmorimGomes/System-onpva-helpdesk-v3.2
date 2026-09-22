#!/usr/bin/env bash
# Inova+ Helpdesk — servidor PHP local (Mac/Linux)
cd "$(dirname "$0")"

if ! command -v php >/dev/null 2>&1; then
  echo "[ERRO] PHP não encontrado. Instale o PHP 8.1+ (ex.: brew install php  |  sudo apt install php-cli)"
  exit 1
fi

if ! php -r 'exit(version_compare(PHP_VERSION,"8.1.0","<")?1:0);'; then
  echo "[ERRO] É necessário PHP 8.1 ou superior. Versão atual: $(php -r 'echo PHP_VERSION;')"
  exit 1
fi

echo "Servidor rodando em http://localhost:8000  (Ctrl+C para parar)"
( sleep 1; (xdg-open "http://localhost:8000/index.html" || open "http://localhost:8000/index.html") >/dev/null 2>&1 ) &
php -S localhost:8000 -d upload_max_filesize=10M -d post_max_size=55M
#!/bin/zsh
set -e

PIUI_DIR="${0:A:h}"
cd "$PIUI_DIR"

if ! command -v node >/dev/null 2>&1 && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "PIUI requires Node.js 22.19 or newer."
  echo "Install Node.js, then double-click this launcher again."
  read "?Press Return to close."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  npm install
fi

npm run build
exec npm start

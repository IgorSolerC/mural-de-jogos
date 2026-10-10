#!/usr/bin/env bash
# O backup do banco da nuvem (ver .github/workflows/backup.yml e api/README.md, "Backup diário").
#
#   bash scripts/backup.sh conferir mural.sql                 o .sql exportado tem as tabelas do mural?
#   bash scripts/backup.sh trancar  mural.sql saida.sql.gz.enc  compacta e tranca com a BACKUP_SENHA
#   bash scripts/backup.sh abrir    saida.sql.gz.enc > mural.sql  destranca e descompacta
#
# A senha vem da variável BACKUP_SENHA (nunca da linha de comando, que fica no histórico).
# Trancado com AES-256 (openssl, chave derivada da senha por PBKDF2 com 600 mil voltas).
set -euo pipefail

TABELAS=(usuarios sessoes murais murais_publicos seguindo seguindo_desfeito atividades reacoes freios uso_diario)

senha() {
  if [ -z "${BACKUP_SENHA:-}" ]; then
    echo "Falta a senha: export BACKUP_SENHA='...' antes de rodar." >&2
    exit 1
  fi
}

cripto() {
  openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -pass env:BACKUP_SENHA "$@"
}

case "${1:-}" in
  conferir)
    arquivo="${2:?diga o .sql}"
    if [ ! -s "$arquivo" ]; then
      echo "O backup veio vazio: $arquivo" >&2
      exit 1
    fi
    for t in "${TABELAS[@]}"; do
      if ! grep -Eqi "CREATE TABLE [\`\"']?$t[\`\"']? *\(" "$arquivo"; then
        echo "O backup não tem a tabela $t: algo deu errado na exportação." >&2
        exit 1
      fi
    done
    echo "Backup conferido: $(wc -c < "$arquivo") bytes, $(grep -c '^INSERT' "$arquivo" || true) linhas de dados."
    ;;
  trancar)
    senha
    entrada="${2:?diga o .sql}"
    saida="${3:?diga o arquivo de saída}"
    gzip -9 -c "$entrada" | cripto -salt -out "$saida"
    ;;
  abrir)
    senha
    entrada="${2:?diga o arquivo trancado}"
    cripto -d -in "$entrada" | gzip -dc
    ;;
  *)
    echo "Uso: bash scripts/backup.sh conferir|trancar|abrir ..." >&2
    exit 2
    ;;
esac

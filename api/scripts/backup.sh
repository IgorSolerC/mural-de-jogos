#!/usr/bin/env bash
# O backup do banco da nuvem (ver .github/workflows/backup.yml e api/README.md, "Backup diário").
#
#   bash scripts/backup.sh conferir mural.sql                 o .sql exportado tem as tabelas do mural?
#   bash scripts/backup.sh trancar  mural.sql saida.sql.gz.enc  compacta e tranca com a BACKUP_SENHA
#   bash scripts/backup.sh abrir    saida.sql.gz.enc > mural.sql  destranca e descompacta
#
# O mesmo script serve o banco do cofre (cofre-api): BACKUP_TABELAS="a b c" troca a lista de tabelas
# que o "conferir" exige (o backup.yml passa a do cofre; um teste do cofre-api confere essa lista).
# O "conferir" também exige linhas de dados nas tabelas de COM_DADOS (no mural, usuarios): um banco
# esvaziado por engano, ou uma exportação cortada depois das tabelas, falha em vez de virar o backup
# do dia (os bons vencem em 30 dias). BACKUP_COM_DADOS="a b" troca a lista; com BACKUP_TABELAS e sem
# ela, nenhuma (o banco do cofre pode estar vazio de verdade).
#
# A senha vem da variável BACKUP_SENHA (nunca da linha de comando, que fica no histórico).
# Trancado com AES-256 (openssl, chave derivada da senha por PBKDF2 com 600 mil voltas).
set -euo pipefail

TABELAS=(usuarios sessoes murais murais_publicos seguindo seguindo_desfeito atividades reacoes comentarios comentario_reacoes freios notas nota_membros agenda_google agenda_pedidos uso_diario api_chaves api_espelho api_espelho_estado api_pedidos oauth_clientes oauth_pedidos oauth_codigos imagens imagens_uso imagem_publica nota_imagens)
COM_DADOS=(usuarios)
if [ -n "${BACKUP_TABELAS:-}" ]; then
  read -r -a TABELAS <<< "$BACKUP_TABELAS"
  COM_DADOS=()
fi
if [ -n "${BACKUP_COM_DADOS:-}" ]; then
  read -r -a COM_DADOS <<< "$BACKUP_COM_DADOS"
fi

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
    for t in "${COM_DADOS[@]}"; do
      if ! grep -Eqi "^INSERT INTO [\`\"']?$t[\`\"']?[ (]" "$arquivo"; then
        echo "O backup não tem nenhuma linha na tabela $t: o banco veio vazio ou a exportação parou no meio." >&2
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

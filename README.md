# finance-hubs

Orçamento doméstico pelo método dos 6 potes. App local, de usuário único, sem autenticação:
Next.js full-stack em TypeScript com SQLite via Drizzle ([ADR-0004](docs/adr/0004-nextjs-full-stack-em-typescript.md)).
O glossário está em [`CONTEXT.md`](CONTEXT.md).

## Subir o app

Precisa de Node 22 ou mais novo.

```sh
npm install
npm start        # compila e sobe em http://localhost:3000
```

Na inicialização, o app cria o banco se ele não existir, aplica as migrations e deixa uma cópia do
banco com data e hora no nome. A cópia é feita antes das migrations, guardando o banco como ele
estava.

Para a pasta não crescer sem fim, o app guarda só as **cinco cópias mais recentes** e, quando o
banco não mudou desde a cópia anterior, não deixa uma cópia nova. A limpeza só mexe nos arquivos com
o nome automático (`finance-hubs-AAAA-MM-DD_HH-MM-SS.db`): **renomeie uma cópia para guardá-la para
sempre**, como em `finance-hubs-antes-da-migration.db`.

| Variável | Padrão | O que é |
|---|---|---|
| `FH_DB_FILE` | `data/finance-hubs.db` | O arquivo SQLite |
| `FH_BACKUP_DIR` | `backups/` ao lado do banco (`data/backups/`) | Onde cada inicialização deixa a sua cópia |

## Desenvolver

```sh
npm run dev          # servidor de desenvolvimento
npm test             # testes de domínio e de persistência
npm run typecheck
npm run db:generate  # gera a migration depois de mudar src/persistence/schema.ts
```

- `src/domain/`: o domínio, puro (sem I/O, sem DOM). Projeção do mês e comandos.
- `src/persistence/`: esquema do Drizzle, carregar e gravar o estado.
- `src/server/`: inicialização (backup, migrations) e as ações do servidor.
- `src/ui/`: a tela do mês.

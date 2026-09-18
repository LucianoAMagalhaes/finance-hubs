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
banco com data e hora no nome.

| Variável | Padrão | O que é |
|---|---|---|
| `FH_ARQUIVO_DB` | `dados/finance-hubs.db` | O arquivo SQLite |
| `FH_PASTA_BACKUP` | `backups/` ao lado do banco | Onde cada inicialização deixa a sua cópia |

## Desenvolver

```sh
npm run dev          # servidor de desenvolvimento
npm test             # testes de domínio e de persistência
npm run typecheck
npm run db:generate  # gera a migration depois de mudar src/persistencia/esquema.ts
```

- `src/dominio/`: o domínio, puro (sem I/O, sem DOM). Projeção do mês e comandos.
- `src/persistencia/`: esquema do Drizzle, carregar e gravar o estado.
- `src/servidor/`: inicialização (backup, migrations) e as ações do servidor.
- `src/tela/`: a tela do mês.

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

## Revisar compras de um aporte

A sugestão mantém a distribuição pela falta de cada classe e pelos ativos aptos. Ao abrir
**Revisar compras**, as compras sugeridas ficam no rascunho até uma alteração explícita.

Quando Renda Fixa recebeu uma parcela, a revisão permite escolher um título do Tesouro apto da
classe, inclusive um título com compra sugerida zero porque sua parcela não comprava 0,01 título.
A escolha substitui as compras de Renda Fixa usando a parcela original da classe, incluindo o
valor que ficou sem destino após o arredondamento. As compras e os dados revisados das demais
classes são preservados. Títulos impedidos continuam indisponíveis, com os motivos à vista.

A opção **Direcionar todo o aporte** usa o valor original do aporte, incluindo o que estava
destinado a outras classes ou sem destino, e mantém somente a compra do título escolhido no
rascunho. A opção **Usar somente a parcela de Renda Fixa** continua disponível. Consultar as
opções não altera as compras; somente a escolha explícita muda o rascunho.

A tela mostra o preço usado, a quantidade em passos de 0,01 título que cabe na parcela e o valor da
compra. Frações de centavo são reservadas arredondando para cima, como no cálculo da sugestão, para
que a compra caiba no valor disponível. O restante não é redistribuído para outros ativos.
Por exemplo, com aporte de R$ 368,52, parcela original de Renda Fixa de R$ 282,97 e Selic a
R$ 19.962,99, a escolha compra 0,01 título por R$ 199,63. Mantendo R$ 85,55 de Ações Internacionais,
o total é R$ 285,18 e ficam R$ 83,34 sem destino.
Direcionando todo esse aporte ao Selic, o rascunho contém somente 0,01 título por R$ 199,63 e
R$ 168,89 sem destino, sem compras de Prefixado ou Ações Internacionais. Se o aporte não comprar
uma fração de 0,01 título, fica integralmente sem destino e não há compra para confirmar.

Quantidade, preço, câmbio, valor e data podem ser corrigidos antes da confirmação. O total e o valor
sem destino acompanham as edições e remoções; se as compras ultrapassarem o aporte, a tela mostra o
excedente. Campos incompletos deixam o cálculo pendente. Cancelar descarta o rascunho. Confirmar
registra as compras em lote, todas ou nenhuma; uma recusa mantém os valores para correção. O valor
sem destino não cria operação nem saldo na carteira.

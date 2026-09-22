# Código em inglês, documentação e tela em português

O domínio foi modelado em português e o glossário do `CONTEXT.md` é a linguagem ubíqua. Por isso,
as primeiras 51 PRs levaram o português para dentro do código. Decidimos separar os dois: **tudo que
é código fica em inglês**, e **fica em português o que é lido por gente**. Código aqui são os
identificadores, os nomes de arquivos e pastas, os comentários, os títulos dos testes, o esquema do
banco, os ids gravados como valor, as variáveis de ambiente, as chaves do navegador e as mensagens de
commit. O que fica em português é a tela, incluindo os erros de validação que chegam a ela, e mais o
`CONTEXT.md`, os ADRs, o README, as issues e as PRs.

A ponte entre os dois idiomas é o glossário: cada termo do `CONTEXT.md` traz o seu nome no código
(`_Code_:`). Um termo tem um nome só em inglês, usado em todo o código. Pote é `Jar`, por causa do
*Six Jars* de T. Harv Eker, a origem do método. Entrada e Lançamento são `Income` e `Expense`.

## Considered Options

**Híbrido: gramática em inglês com os substantivos do domínio em português** (`getPotes`,
`class Lancamento`). É comum em projetos DDD brasileiros e dispensa tradução. Rejeitado, porque a
mistura dos dois idiomas numa mesma linha é justamente o que deixa o código estranho de ler.

**Só o código novo em inglês.** Rejeitado. O repositório ficaria misturado para sempre, e o custo
de migrar só cresce.

## Consequences

- A migração de dados renomeia tabelas e colunas e converte os ids gravados (`custos-fixos` passa a
  `fixed-costs`). As migrations já aplicadas não são reescritas, porque o drizzle as registra por
  hash no banco real. O que a pessoa digitou, como descrições e nomes de tag, não é traduzido.
- `boleto` e `pix` não têm tradução e ficam como nomes próprios.
- A conferência da importação do app antigo é a prova de que a migração não mudou nenhum número.

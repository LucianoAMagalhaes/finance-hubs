# Escolher o Selic na revisão de compras

Decisão discutida com a pessoa usuária em 09/10/2026 e implementada nas
[PR #125](https://github.com/LucianoAMagalhaes/finance-hubs/pull/125) e
[PR #126](https://github.com/LucianoAMagalhaes/finance-hubs/pull/126).

Especificação publicada na [issue #122](https://github.com/LucianoAMagalhaes/finance-hubs/issues/122),
concluída pelas entregas #123 e #124.

## Problema

O Tesouro Selic 2031 tem nota positiva e pode receber aporte, mas sua parcela na sugestão pode não
comprar uma fração de 0,01 título. Antes da mudança, quando ele recebia valor zero, não aparecia
na revisão de compras e a pessoa não conseguia escolhê-lo nessa tela.

## Comportamento implementado

- Manter o cálculo atual da sugestão de aporte, incluindo a comparação da falta entre classes.
- Permitir escolher o Selic na revisão de compras mesmo quando ele ficou com zero por causa da
  fração mínima, desde que continue apto a receber aporte.
- Permitir substituir a compra de Prefixado pela de Selic, mantendo as compras de Ações
  Internacionais, ou direcionar todo o aporte ao Selic, retirando as outras compras.
- Mostrar quanto cabe comprar e quanto fica sem destino segundo as compras escolhidas.
- Deixar sem destino o valor que não compra outra fração do Selic. A escolha manual de comprar
  apenas Selic não deve gerar compras de outros ativos automaticamente.
- Registrar as operações somente depois da confirmação da pessoa.

## Caminho na tela

Na Carteira, informar o valor em **Aportar agora** e clicar em **Sugerir**. Na sugestão, clicar
em **Registrar compras** para abrir a revisão, sem gravar operações. Quando Renda Fixa recebeu
uma parcela, a seção **Escolher um título do Tesouro para Renda Fixa** oferece, para cada título
apto, **Usar somente a parcela de Renda Fixa** e **Direcionar todo o aporte**. A confirmação final
em **Registrar compras** grava as compras revisadas; **Cancelar** descarta o rascunho.

## Exemplo discutido

Para um aporte de R$ 368,52, com preço unitário salvo de aproximadamente R$ 19.962,99 no Selic,
a escolha de direcionar todo o aporte a ele permite comprar 0,01 título por cerca de R$ 199,63.
Os R$ 168,89 restantes ficam sem destino. Esses valores dependem da cotação usada na revisão.

## Limite da decisão

A discussão resolveu o caso do Selic que ficou fora da revisão por arredondamento. Não definiu
uma liberdade geral para escolher qualquer ativo de qualquer classe, nem novas regras para
ultrapassar o alvo de uma classe. Essas decisões não devem ser inferidas deste documento.

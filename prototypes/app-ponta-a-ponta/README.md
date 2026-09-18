# PROTÓTIPO — O app de ponta a ponta

Descartável. Responde a [#13](https://github.com/LucianoAMagalhaes/finance-hubs/issues/13). Abra
`index.html` no navegador. Tudo fica em memória, e "Recomeçar dados" volta ao início.

**Pergunta:** com tudo o que o mapa já decidiu, como fica o app de ponta a ponta, e onde o fluxo
quebra?

Aqui não há variantes para comparar. É o app inteiro montado sobre a tela do mês já decidida (#10:
dois andares; #12: mestre-detalhe), com os gestos que ainda não tinham aparecido numa tela.

- **Formulário de gasto** com À vista / Parcelado / Recorrente, reembolso e tag
- **Recorrente** aberto num mês: a lista de vigências, "Salvar a partir de" e "Encerrar a partir de"
- **Parcelado** como compra única, com aviso de que a correção reescreve meses passados
- **Entrada** com Fonte e só os três tipos de pagamento que creditam
- **Percentuais do mês**, com o aviso de "ainda não nasceu" e o bloqueio acima de 100%
- **Navegação entre meses**: passado editável, e futuro sem entrada, portanto sem limite
- **Renomear tag**, com fusão, a partir do detalhe do eixo Tag

## Painel do protótipo (à direita)

- **Roteiros:** seis cenários guiados. Os botões só navegam e abrem os formulários já preenchidos.
  Quem salva é você.
- **Estado gravado:** o que o app de fato guarda (orçamentos que nasceram, vigências, compras,
  lixeira) e, em português, o que cada ação mudou.
- **Buracos:** as regras que a tela precisou inventar porque o mapa não as decidiu. No app, cada
  uma aparece marcada com ⚑. **Esses buracos são o resultado do protótipo.**

## Estrutura

O script tem duas partes. `Dominio` é um módulo puro, sem DOM: grava, deriva (ADR-0002) e aplica
as mudanças. É a parte que vale reescrever no app real. O resto é casca.

# Orçamento é um snapshot mensal, sem retroatividade

Os percentuais dos potes mudam ao longo do tempo, e a pergunta central do app — _"estourei em
março, e por quanto?"_ — precisa ter a mesma resposta para sempre. Por isso cada mês guarda a sua
própria cópia dos `{seis percentuais}`, e editar um mês nunca altera nenhum outro.

## Considered Options

A alternativa óbvia era **uma configuração global** de percentuais, aplicada a todos os meses.
Ela é mais simples e mais barata, e foi rejeitada porque faz o veredito de um mês passado se
reescrever sozinho: mexer num percentual em setembro mudaria retroativamente se março estourou ou
não. Um histórico que se reescreve não vale nada, e o histórico é o produto.

## Consequences

- Existe uma entidade a mais no modelo — o orçamento de um mês — que a configuração global não
  exigiria.
- Um mês novo precisa nascer de algum lugar: ele copia o mês anterior, e os percentuais padrão
  (30/25/15/15/10/5) só entram quando não há mês anterior nenhum.
- Meses continuam editáveis para sempre: não existe ação de "fechar o mês". Um mês passado para
  de mudar porque ninguém mexe nele, não porque o app trancou.
- A receita **saiu** do snapshot, que originalmente guardava `{receita, seis percentuais}`. Ela
  virou derivada — a soma das entradas do mês — e o que é derivado não se fotografa. A tese acima
  sobrevive intacta: as entradas de março também pertencem a março, então o veredito de março só
  muda se alguém for até março e mexer nele, que é exatamente a propriedade que este ADR defende.

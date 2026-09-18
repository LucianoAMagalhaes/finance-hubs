# Next.js full-stack em TypeScript

A tela do mês recalcula limites, vereditos e agregados **no navegador, enquanto se digita**, sem ida
ao servidor. O protótipo da tela do mês fixou isso como requisito. Então o app tem JavaScript no
cliente de qualquer jeito, e a única escolha real era qual linguagem roda no servidor. Escolhemos
**Next.js full-stack em TypeScript, com SQLite via Drizzle**, para que a lógica do domínio fique em
**uma linguagem só**. A regra mais delicada do app é a derivação de ocorrências do ADR-0002: centavo
na 1ª parcela, vigências de recorrente, parcelado apagado. Com TypeScript nas duas pontas, ela é
escrita uma vez e roda no servidor ou no navegador, onde for conveniente.

A escolha surpreende, porque o dev é mais forte em Python. Mas esse Python é de análise de dados,
não de web: o dev nunca usou Django, e as duas opções exigiam aprender um framework novo de
qualquer forma.

## Considered Options

**Django com uma ilha de TypeScript na tela do mês.** Rejeitada. A derivação ficaria em Python no
servidor, e as somas, em TS no navegador. O domínio ficaria dividido em duas linguagens, e o dev
teria que aprender Django e também o front-end. A tela é quase toda cliente (mestre-detalhe, troca
de eixo, recálculo ao vivo), então o Django serviria basicamente como banco com migrations. O que
se perde com isso: o admin grátis e migrations mais maduras.

**FastAPI + Jinja/HTMX.** Rejeitada. O HTMX faz interatividade por ida ao servidor a cada gesto,
que é justamente a variante que perdeu no protótipo. Sem ele, o FastAPI vira um Django sem
migrations nem formulários, e continua precisando do mesmo JavaScript no navegador.

## Consequences

- "Sem API separada" quer dizer um processo, um repositório e um comando para subir. Endpoints
  internos consumidos pela própria tela estão permitidos.
- Acesso pelo celular, que é ambição futura, não pesou na escolha. Continua possível: o app roda
  num VPS ou em contêiner com o arquivo SQLite, sem depender de hospedagem serverless.

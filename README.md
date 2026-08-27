# Meu Dinheiro

App de bolso que responde uma pergunta só: **ainda posso gastar hoje?**

Os dados continuam na sua planilha do Google. O app é um PWA — instala na tela
inicial do Android como qualquer aplicativo, funciona sem internet e atualiza
sozinho quando o código muda.

```
app/        o aplicativo (HTML/CSS/JS puro, sem build)
backend/    Code.gs — cola dentro da sua planilha
```

---

## 1. Rodar no computador

```bash
python -m http.server 8123 --directory app
```

Abra <http://localhost:8123>. Serve para testar; o app de verdade precisa do passo 3.

---

## 2. Ligar a planilha

1. Abra a planilha → **Extensões › Apps Script**.
2. Apague o conteúdo e cole tudo de [backend/Code.gs](backend/Code.gs).
3. **Configurações do projeto › Propriedades do script › Adicionar**, e crie
   `TOKEN` com uma senha longa e aleatória.

   > O token não fica no `Code.gs`. As propriedades são área privada da sua
   > conta Google, então o arquivo continua sem nada pessoal — e atualizar o
   > backend passa a ser só colar a versão nova por cima, sem redigitar
   > configuração. Rode `diagnostico()` para ver o que já está preenchido.

   As outras propriedades são opcionais e todas têm padrão: `GMAIL_BUSCA`,
   `AVISAR_DIAS_ANTES`, `ABA_ANTIGA`, `ABA_ANTIGA_2`, `TELEGRAM_BOT_TOKEN`,
   `TELEGRAM_CHAT_ID`, `NTFY_TOPICO`.
4. Rode a função **`instalar`** uma vez (menu de funções › `instalar` › Executar).
   Autorize quando o Google pedir. Isso cria as abas `Lancamentos`,
   `Compromissos`, `Config` e `Auto`, e agenda os gatilhos.
5. **Implantar › Nova implantação › Aplicativo da Web**
   - Executar como: **eu**
   - Quem pode acessar: **qualquer pessoa**

   > "Qualquer pessoa" aqui significa qualquer pessoa **que tenha a URL e o
   > token**. A URL é secreta e o token é conferido em toda chamada — sem ele
   > o script responde `Token inválido` e nada mais. Essa é a única opção que
   > permite ao celular chamar o script sem login do Google.

6. Copie a URL `.../exec` e cole em **Ajustes** no app, junto com o token.

### Quem manda na configuração

Renda, meta e compromissos existem nos dois lados, então há uma regra fixa:

- **Primeira sincronização:** a planilha manda. O app baixa tudo o que o
  importador trouxe, e você não redigita nada.
- **Daí em diante:** o app manda. Cada sync reescreve as abas `Config` e
  `Compromissos` com o que está no celular.

Ou seja: **sincronize antes de cadastrar qualquer coisa no app.** Se você
cadastrar primeiro, a primeira sync sobrescreve o que você digitou.

Depois disso, edite sempre pelo app. Editar direto na planilha funciona até a
próxima sincronização apagar — as abas são espelho, não fonte.

---

## 3. Instalar no celular

O app é publicado pelo GitHub Pages em
**<https://cosme744.github.io/financas/>**

No Chrome do Android: abra a URL → menu **⋮** → **Instalar aplicativo**.
Vira ícone na tela inicial, abre em tela cheia, sem barra de navegador.

### Como atualizar o app

```bash
git add -A && git commit -m "o que mudou" && git push
```

O workflow [.github/workflows/publicar.yml](.github/workflows/publicar.yml)
republica a pasta `app/` sozinho. Nada de arrastar pasta.

### O que NÃO se atualiza sozinho

O `backend/` fica versionado junto, mas nunca é servido — ele roda dentro do
Apps Script. Mudou o `Code.gs`? **Cole no editor do Apps Script na mão**, e
depois **Implantar › Gerenciar implantações › editar › Nova versão** (sem esse
segundo passo a URL continua servindo o código velho).

Como as configurações moram nas propriedades, colar por cima é seguro: não há
mais nada seu dentro do arquivo para se perder no caminho.

Para automatizar também esse lado, o caminho é o [clasp](https://github.com/google/clasp),
a CLI oficial do Apps Script:

```bash
npm i -g @google/clasp
clasp login
clasp clone <ID do projeto do Apps Script>   # gera .clasp.json, que o .gitignore já barra
clasp push                                    # manda o backend/ para a planilha
```

### Por que o repositório é público

Não por descuido: **o GitHub Pages só publica de repositório público no plano
gratuito.** Tornar este repositório privado derrubaria o app, e a alternativa
seria um plano pago — que não é o combinado aqui.

Então a regra é que **não existe segredo no código**. A URL do Web App e o
token são digitados por você em Ajustes e ficam só no seu celular; as
configurações do backend moram nas Propriedades do Script, dentro da sua conta
Google. O `.gitignore` barra backups e credenciais do clasp.

Como "tomar cuidado" não é defesa — segredo que entra no histórico do GitHub
continua acessível mesmo depois de removido do arquivo —, há uma conferência
automática antes de cada commit:

```bash
node scripts/segredos.js --instalar   # uma vez, por cópia do repositório
```

A partir daí todo `git commit` passa por [scripts/segredos.js](scripts/segredos.js),
que barra token do backend, URL real do `/exec`, ID de planilha do Google,
token de bot do Telegram, tópico do ntfy, credencial do clasp e backup de
lançamentos. Para varrer tudo o que já está versionado:

```bash
node scripts/segredos.js --tudo
```

---

## 4. O dia a dia

A ideia é mexer no app quase nada. Uma vez por mês você abre **Ajustes**,
confere quanto entra e quanto quer guardar, e sincroniza. O resto o app faz
sozinho.

**Hoje** responde as três perguntas do dia: quanto ainda dá para gastar, o que
está pendente, e quanto já saiu hoje. Lançou, o número muda na hora — não
depende de sincronizar, porque o celular é a fonte da verdade imediata e a
planilha é o destino final.

**Lançar** tem sete categorias, e cada uma decide sozinha:

| | |
|---|---|
| **Mercado** | comida que você leva para casa |
| **Comer fora** | restaurante, lanche, delivery, café |
| **Transporte** | combustível, passagem, aplicativo, estacionamento |
| **Casa** | manutenção, limpeza, conta avulsa |
| **Saúde** | farmácia, consulta, exame |
| **Por que eu quis** | o que não precisava |
| **Outros** | o que sobrou |

Eram dez, e as dez brigavam entre si: *Mercado* e *Comida* disputavam a mesma
compra, *Carro* e *Transporte* o mesmo abastecimento, *Lazer* e *Compras* o
mesmo impulso. Categoria ambígua custa caro justamente onde o app precisa ser
rápido — parado no caixa, decidindo.

*Assinaturas* e *Carro* sumiram porque não eram categorias de lançamento: o que
se repete todo mês é **compromisso**, cadastrado uma vez e contado sozinho daí
em diante.

**Por que eu quis** é a única que responde a uma pergunta diferente. As outras
dizem para onde o dinheiro foi; essa diz quanto dele você **escolheu** gastar.
Por isso ela aparece em destaque na tela Hoje e em amarelo no gráfico do mês.
Use quando quiser — o que não for marcado assim simplesmente não entra na conta.

> Lançamento antigo continua com o nome antigo. Nada é reescrito para trás, então
> por um mês ou dois as duas listas convivem no gráfico.

**Mês** separa o que você já sabia que ia pagar (compromissos) do que decidiu
gastar (dia a dia), porque misturar os dois deixa a lista inútil: a fatura do
cartão sozinha esmaga o resto e a barra do almoço vira um fio invisível. O
extrato vem agrupado por dia, com o total de cada um.

**Futuro** junta meses seguidos que custam a mesma coisa numa faixa só, mostra
quando cada parcelamento termina e quanto isso devolve por mês. No fim, a conta
aberta da sobra — renda, menos meta, menos compromissos, menos sua média de
gasto — para você ver de onde o número saiu em vez de ter que acreditar nele.

---

## 5. Avisos de conta a vencer

Todo dia às 8h o script manda uma mensagem com o que está para vencer e quanto
você ainda pode gastar. Escolha **um** canal em `CONFIG`:

**Telegram** (recomendado — é privado)
1. Fale com [@BotFather](https://t.me/BotFather) → `/newbot` → copie o token
2. Mande qualquer mensagem para o seu bot
3. Abra `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` e pegue o `chat.id`
4. Preencha `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`

**ntfy.sh** (sem cadastro)
Instale o app ntfy, inscreva-se num tópico e preencha `NTFY_TOPICO`.
⚠️ Tópicos do ntfy.sh são públicos para quem souber o nome — use algo longo e
aleatório, tipo `financas-r7k2m9x4qp`, ou prefira o Telegram.

Sem nenhum dos dois configurado, o aviso chega por e-mail.

---

## 6. Lançar sem digitar

Duas camadas, e vale usar as duas — uma cobre o que a outra deixa passar.

### 6.1 E-mail do banco (já pronto, custo zero)

A cada 15 minutos o script varre o Gmail procurando e-mails de compra, extrai o
valor e o estabelecimento, e lança na planilha já categorizado.

Ajuste `GMAIL_BUSCA` em `CONFIG` para os seus bancos. Para descobrir a busca
certa, procure no Gmail por uma compra recente e copie os termos que funcionaram.

Cada e-mail é lançado **no máximo uma vez** — a chave é o id da mensagem.

### 6.2 Notificação do celular (cobre o que não vem por e-mail)

Compra no crédito quase sempre gera um push do banco na hora. Um app de
automação lê esse push e manda para o script — sem precisar de app nativo:

1. Instale o **MacroDroid** (grátis) ou Tasker
2. Nova macro:
   - **Gatilho:** Notificação recebida → selecione o app do seu banco
   - **Ação:** HTTP Request → `POST` para a sua URL `/exec`
     - Content-Type: `text/plain`
     - Corpo:
       ```json
       {"acao":"notificacao","token":"SEU_TOKEN","texto":"[notification_text]","app":"banco"}
       ```
3. Faça uma compra de teste e confira a aba `Auto` da planilha

O script ignora estornos, compras recusadas e avisos de fatura — só lança o que
é gasto de verdade. Se não reconhecer o formato, não lança nada: é melhor
faltar um lançamento do que aparecer um errado.

**Antes de confiar, teste com os seus bancos.** Abra `backend/teste-parser.html`
no navegador, cole uma mensagem real e veja o que seria lançado. Nada é gravado.

```bash
python -m http.server 8200 --directory backend
```

Depois abra <http://localhost:8200/teste-parser.html>. A página também roda 12
casos de referência a cada carregamento — se algum falhar, o parser regrediu.

### 6.3 Open Finance (quando quiser o nível seguinte)

[Pluggy](https://pluggy.ai) ou Belvo conectam direto na conta do banco e trazem
todas as transações, inclusive as que não geram push nem e-mail. É a opção mais
confiável e a única paga. Dá para plugar depois sem mexer no app.

---

## Os três conceitos

### Compromisso

Uma estrutura só para tudo que se repete, tenha fim ou não:

```js
{ nome: 'Curso de inglês', valor: 200, dia: 10,
  inicio: '2026-01',      // mês da 1ª parcela
  parcelas: 12,           // null = indefinido (luz, internet, aluguel)
  extraPrimeira: 0,       // cobrança que só vem na 1ª parcela
  reembolso: 0,           // quanto alguém te devolve por mês
  reembolsoTotal: false } // ou devolvem o valor cheio
```

Com `parcelas` preenchido, o app sabe em que parcela você está, quanto falta
pagar e **quando aquilo sai da sua vida**. Passada a última, some sozinho.

### A primeira parcela que vem maior

`extraPrimeira` existe por um motivo concreto: consignado costuma cobrar o
seguro **uma única vez**, junto da primeira parcela. Sem esse campo, um
parcelamento assim só pode ser descrito errado — ou você infla as 48 parcelas,
ou finge que a primeira foi igual às outras. Os dois jeitos mentem sobre
quanto você ainda vai pagar.

```js
{ nome: 'Consignado', valor: 950.40, parcelas: 48, inicio: '2026-08',
  extraPrimeira: 749.60, reembolsoTotal: true }
```

Lê-se: 48 parcelas de R$ 950,40, sendo que a primeira vem R$ 1.700,00 porque
carrega o seguro junto.

### Reembolso

Quando o dinheiro sai da sua conta mas não é seu gasto. Duas formas:

- **Uma parte** (`reembolso: 950.40`) — alguém banca um pedaço, o resto é seu.
- **O valor cheio** (`reembolsoTotal: true`) — você pegou o empréstimo para
  outra pessoa e ela devolve tudo. O líquido é **zero**: passa pela sua conta
  sem nunca ser seu.

O "posso gastar" só enxerga o líquido. Um consignado de R$ 950,40 integralmente
devolvido não tira um centavo do seu mês — e é isso que a tela precisa dizer,
senão você se acha mais pobre do que é.

Ao marcar como pago, o app lança **dois** registros — a saída cheia e a entrada
do reembolso, marcada como dinheiro de passagem. A planilha bate com o extrato
e o cálculo continua honesto.

### Gasto pontual

Passagem, pote da mãe, aquele imprevisto. Não precisa cadastrar nada: lança
pelo teclado e pronto. Some do mês seguinte sozinho, e continua no histórico.

---

## Corrigir depois

Lançar rápido e lançar certo são coisas diferentes. O teclado da aba Lançar é
feito para ser rápido, e rápido erra. Sem poder corrigir pelo celular, a saída
seria abrir a planilha no computador — exatamente o que o app existe para
evitar.

**Toque em qualquer lançamento**, na Hoje ou no Mês, e um painel sobe de baixo:
valor, data, método, categoria, descrição, e o botão de apagar. Toque em
qualquer **compromisso** em Ajustes e o formulário abaixo carrega os valores
dele para você editar em vez de cadastrar outro.

Nada é gravado enquanto você não confirma, então fechar sem salvar realmente
não muda nada.

A correção viaja para a planilha na sincronização seguinte. A fila entende a
ordem das coisas: um lançamento criado e editado antes de subir continua sendo
uma inserção, e apagar o que ainda não subiu apenas cancela a inserção, em vez
de mandar a planilha apagar uma linha que nunca existiu.

---

## A planilha continua legível

A função `instalar` formata a aba `Lancamentos` (cabeçalho fixo, data em
dd/mm/aaaa, valores em reais, negativo em vermelho) e monta uma aba **Painel**
com **fórmulas de verdade** sobre ela:

| | |
|---|---|
| Entrou / Reembolsos / Saiu | do mês em `B2` |
| **Saldo do mês** | em verde |
| Renda, meta, compromissos líquidos | de `Config` e `Compromissos` |
| **Sobra prevista** | em verde |

São fórmulas, não valores calculados pelo script: o painel se atualiza sozinho
a cada lançamento que o celular manda, sem o script precisar rodar de novo.
Trocar o mês na célula `B2` reescreve o painel inteiro.

Para reaplicar sem mexer em dados, rode `formatar()` ou `montarPainel()`
avulsos no editor.

## Como o "pode gastar hoje" é calculado

```
sobra    = renda − meta − compromissos (pagos + a vencer, já líquidos) − gastos do mês
por dia  = sobra ÷ dias que faltam no mês
```

Verde quando você está no ritmo, amarelo quando está gastando rápido demais,
vermelho quando a sobra ficou negativa.

Os compromissos entram no cálculo **antes de serem pagos**. É o que impede o
app de dizer que você tem dinheiro no dia 3 quando tudo vence no dia 10.

A aba **Futuro** projeta 6 meses à frente e mostra quanto cada parcelamento
que termina devolve para o seu bolso.

---

## Importar a planilha atual

Aponte `ABA_ANTIGA` em `CONFIG` para a sua aba antiga e rode
**`importarPlanilhaAntiga`** no editor do Apps Script. Ela lê o formato
`Data de vencimento | Tipo | Grupo | Categoria | Conta | Descricao | Valor |
Pago?` e preenche as abas novas:

- `Despesa` + `Fixo` → vira **Compromisso**
- `x5` em qualquer coluna à direita → vira **5 parcelas**
- o resto → vira **lançamento**

**Nada da aba de origem é alterado**, e rodar de novo não duplica: os ids vêm
de descrição + valor, então o que já entrou é reconhecido.

> **Uma coisa fica errada de propósito.** A planilha antiga não registra em que
> mês cada parcelamento começou, então o importador chuta o mês atual. Para um
> `x5` que já está na 3ª parcela, isso erra a data de término — que é
> exatamente o que a aba Futuro calcula. Ao terminar, a função devolve a lista
> do que precisa ser conferido, e o mesmo aviso fica na aba `Auto`. Corrija a
> coluna `inicio` na aba `Compromissos` antes de confiar na projeção.

O nome pode ser parcial: `Financeiro` encontra `Gastos - Financeiro`. Se casar
com mais de uma aba, o script avisa e pede o nome completo em vez de escolher
sozinho. Para importar outra aba sem mexer na configuração, chame
`importarPlanilhaAntiga('Nome exato da aba')`.

---

## Escanear cupom / QR code

Na aba **Lançar**, o botão **⛶ Escanear QR** abre a câmera. O app entende dois
formatos, decodificados no próprio celular — sem biblioteca externa, sem
mandar a imagem para lugar nenhum:

| Código | O que sai dele |
|---|---|
| **QR do Pix** (BR Code) | Recebedor, cidade, txid, e o valor **quando o código carrega valor** |
| **QR da NFC-e** (cupom fiscal) | Chave de acesso, CNPJ do emitente, número e UF da nota |

Nada é lançado sozinho: o QR preenche o visor e **você confirma**. Método de
pagamento e categoria continuam seus, porque o cupom fiscal não registra se
você passou no crédito ou no débito.

### Sobre o valor não vir sempre

Vale saber antes de estranhar:

- **NFC-e versão 2 "normal"** — o formato mais comum hoje — carrega só
  `chNFe|nVersao|tpAmb|cIdToken|cHash`. **Não tem o valor.** Você digita.
- **NFC-e versão 1** e a **versão 2 em contingência** trazem `vNF`. Valor
  preenchido sozinho.
- **Pix estático** (o adesivo do balcão) costuma vir sem valor: o mesmo código
  serve para qualquer quantia.
- **Pix dinâmico** guarda o valor num endereço do banco, não no código.

Mesmo sem o valor, ler o QR da nota vale a pena: traz a data, o CNPJ da loja e
— principalmente — **a chave de acesso**, que é única por nota. O lançamento
usa essa chave como id, então ler a mesma nota duas vezes não duplica nada,
nem aqui nem na planilha.

### Nome da loja

Com o CNPJ em mãos, o app consulta a [BrasilAPI](https://brasilapi.com.br) e
troca `CNPJ 12.345.678/0001-95` pelo nome do estabelecimento. Sai do celular
**só o CNPJ de quem te vendeu** — dado de registro público, nunca o valor nem o
que você comprou. O resultado fica em cache e a consulta é desligável em
**Ajustes › Leitura de QR**.

### Antes de confiar

Abra <https://cosme744.github.io/financas/teste-qr.html> no celular, leia um
cupom seu e veja o que sairia. Nada é gravado. A página também roda os casos de
[app/casos-qr.js](app/casos-qr.js) a cada carregamento — se algum falhar, o
leitor regrediu.

**O que não dá para ler:** o comprovante da maquininha (a via do cartão) não
carrega dado estruturado nenhum. O QR que vale escanear é o do **cupom
fiscal**, não o do comprovante. Se o app não reconhecer, ele diz isso em vez
de chutar um lançamento.

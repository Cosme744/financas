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
3. No topo do arquivo, troque `TOKEN` por uma senha longa e aleatória.
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

O `backend/` fica versionado junto, mas nunca é servido — ele roda dentro do
Apps Script. Se mudar o `Code.gs`, ainda é preciso colar no editor do Apps
Script na mão; o GitHub só guarda o histórico.

> **O repositório é público, e de propósito.** Não há segredo no código:
> a URL do Web App e o token são digitados por você em Ajustes e ficam
> apenas no seu celular. O `.gitignore` mantém fora do repositório o arquivo
> cujo nome é o seu token e os backups exportados pelo app.

---

## 4. Avisos de conta a vencer

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

## 5. Lançar sem digitar

Duas camadas, e vale usar as duas — uma cobre o que a outra deixa passar.

### 5.1 E-mail do banco (já pronto, custo zero)

A cada 15 minutos o script varre o Gmail procurando e-mails de compra, extrai o
valor e o estabelecimento, e lança na planilha já categorizado.

Ajuste `GMAIL_BUSCA` em `CONFIG` para os seus bancos. Para descobrir a busca
certa, procure no Gmail por uma compra recente e copie os termos que funcionaram.

Cada e-mail é lançado **no máximo uma vez** — a chave é o id da mensagem.

### 5.2 Notificação do celular (cobre o que não vem por e-mail)

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

### 5.3 Open Finance (quando quiser o nível seguinte)

[Pluggy](https://pluggy.ai) ou Belvo conectam direto na conta do banco e trazem
todas as transações, inclusive as que não geram push nem e-mail. É a opção mais
confiável e a única paga. Dá para plugar depois sem mexer no app.

---

## Os três conceitos

### Compromisso

Uma estrutura só para tudo que se repete, tenha fim ou não:

```js
{ nome: 'Curso de inglês', valor: 200, dia: 10,
  inicio: '2026-01',   // mês da 1ª parcela
  parcelas: 12,        // null = indefinido (luz, internet, aluguel)
  reembolso: 0 }       // quanto alguém te devolve desse valor
```

Com `parcelas` preenchido, o app sabe em que parcela você está, quanto falta
pagar e **quando aquilo sai da sua vida**. Passada a última, some sozinho.

### Reembolso

Empréstimo em que outra pessoa paga parte: `valor` é o que debita da sua conta,
`reembolso` é o que volta. O "posso gastar" só enxerga a diferença.

Ao marcar como pago, o app lança **dois** registros — a saída cheia e a entrada
do reembolso, marcada como dinheiro de passagem. A planilha bate com o extrato
e o cálculo continua honesto.

### Gasto pontual

Passagem, pote da mãe, aquele imprevisto. Não precisa cadastrar nada: lança
pelo teclado e pronto. Some do mês seguinte sozinho, e continua no histórico.

---

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

## Escanear cupom / QR code (ainda não implementado)

É viável, com precisões diferentes conforme o código:

| Código | O que dá para extrair | Confiabilidade |
|---|---|---|
| **QR do Pix** (BR Code) | Valor e recebedor, decodificado no próprio celular | Alta, funciona offline |
| **QR da NFC-e** (cupom fiscal) | Valor total sai da própria URL | Boa |
| Itens do cupom | Exigiria consultar a SEFAZ de cada estado | Frágil, varia por estado |

O Chrome do Android tem `BarcodeDetector` nativo, então o PWA lê o QR pela
câmera sem biblioteca externa. O caminho seria: escanear → mostrar valor e
estabelecimento → você confirma a categoria → lança.

Comprovante de maquininha, por si só, não costuma trazer dados estruturados —
o que vale escanear é o QR da nota fiscal.

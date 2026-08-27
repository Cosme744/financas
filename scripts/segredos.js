#!/usr/bin/env node
/**
 * segredos.js — barra segredo antes de virar commit.
 *
 * O repositório é público porque precisa ser: o GitHub Pages só publica de
 * repositório público no plano gratuito. Então a defesa não pode ser "tomar
 * cuidado" — tem que ser automática, e tem que agir ANTES do push, porque
 * segredo que entra no histórico do GitHub continua acessível mesmo depois
 * de removido do arquivo.
 *
 *   node scripts/segredos.js            confere o que está no stage
 *   node scripts/segredos.js --tudo     confere todos os arquivos versionados
 *   node scripts/segredos.js --instalar instala como hook de pre-commit
 *
 * Sai com código 1 quando acha algo, que é o que faz o commit parar.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REGRAS = [
  {
    nome: 'Token do backend preenchido',
    // Pega TOKEN: 'algo' com conteúdo real. String vazia é o estado correto
    // do arquivo versionado — o valor de verdade mora nas Propriedades do
    // Script, que nunca passam por aqui.
    re: /\bTOKEN\s*:\s*['"][^'"]{6,}['"]/g,
    excecoes: [/TROQUE-ISTO/i, /SEU[-_]TOKEN/i, /SUA[-_]SENHA/i],
    dica: 'O TOKEN vai em Configurações do projeto › Propriedades do script, não no arquivo.',
  },
  {
    nome: 'URL real do Web App do Apps Script',
    re: /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/g,
    dica: 'A URL do /exec é secreta: ela é digitada em Ajustes e fica só no seu celular.',
  },
  {
    nome: 'ID de planilha ou arquivo do Google',
    re: /(?:spreadsheets\/d|drive\.google\.com\/[^\s]*[?&]id=)\/?[A-Za-z0-9_-]{30,}/g,
    dica: 'O link da sua planilha identifica os seus dados. Não versione.',
  },
  {
    nome: 'Token de bot do Telegram',
    re: /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g,
    dica: 'Quem tem o token do bot manda mensagem no seu lugar. Use as Propriedades do Script.',
  },
  {
    nome: 'Tópico do ntfy preenchido',
    re: /\bNTFY_TOPICO\s*:\s*['"][^'"]{3,}['"]/g,
    dica: 'Tópico de ntfy é público para quem souber o nome. Use as Propriedades do Script.',
  },
  {
    nome: 'Credencial do clasp',
    re: /"(?:refresh_token|access_token|client_secret)"\s*:/g,
    dica: 'O .clasp.json e o .clasprc.json dão acesso à sua conta Google. Já estão no .gitignore.',
  },
  {
    nome: 'Backup de lançamentos',
    re: /"transacoes"\s*:\s*\[\s*\{/g,
    dica: 'Backup exportado contém todos os seus gastos. Já está no .gitignore.',
  },
];

// Binário e ícone não são texto; ler byte a byte só geraria alarme falso.
const IGNORAR = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|pdf)$/i;

function arquivos(tudo) {
  const cmd = tudo
    ? 'git ls-files'
    : 'git diff --cached --name-only --diff-filter=ACMR';
  return execSync(cmd, { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !IGNORAR.test(l) && fs.existsSync(l));
}

function conferir(lista) {
  const achados = [];

  for (const arquivo of lista) {
    let texto;
    try { texto = fs.readFileSync(arquivo, 'utf8'); } catch { continue; }
    if (texto.includes('\0')) continue;                 // binário disfarçado

    const linhas = texto.split('\n');
    for (const regra of REGRAS) {
      // Este próprio arquivo descreve os padrões; ele não pode se acusar.
      if (path.resolve(arquivo) === path.resolve(__filename)) continue;

      linhas.forEach((linha, i) => {
        regra.re.lastIndex = 0;
        const m = regra.re.exec(linha);
        if (!m) return;
        if ((regra.excecoes || []).some((e) => e.test(linha))) return;
        achados.push({ arquivo, linha: i + 1, regra, trecho: m[0].slice(0, 60) });
      });
    }
  }
  return achados;
}

function instalar() {
  const dir = execSync('git rev-parse --git-path hooks', { encoding: 'utf8' }).trim();
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, 'pre-commit');
  fs.writeFileSync(alvo,
    '#!/bin/sh\n'
    + '# Instalado por scripts/segredos.js --instalar\n'
    + 'exec node scripts/segredos.js\n', { mode: 0o755 });
  console.log('Hook instalado em ' + alvo);
  console.log('A partir de agora todo commit passa por esta conferência.');
}

function main() {
  if (process.argv.includes('--instalar')) return instalar();

  const achados = conferir(arquivos(process.argv.includes('--tudo')));
  if (!achados.length) {
    console.log('Nada sensível encontrado.');
    return;
  }

  console.error('\nCOMMIT BLOQUEADO — isto não pode ir para um repositório público:\n');
  for (const a of achados) {
    console.error(`  ${a.arquivo}:${a.linha}`);
    console.error(`    ${a.regra.nome}: ${a.trecho}`);
    console.error(`    ${a.regra.dica}\n`);
  }
  console.error('Tire o valor do arquivo e tente de novo.');
  console.error('Se for alarme falso: git commit --no-verify\n');
  process.exit(1);
}

main();

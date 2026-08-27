// casos-qr.js — casos de referência do leitor de QR.
//
// Rodam na página teste-qr.html a cada carregamento. Se algum falhar, o
// parser regrediu — é a rede de segurança de um app que lança dinheiro
// sozinho a partir do que a câmera enxergou.
//
// Não é servido como parte do app: fica fora da lista do service worker e
// só é carregado pela página de teste.

import { crc16 } from './js/qr.js';

/** Monta um BR Code válido fechando o CRC — assim os casos não envelhecem. */
export function pix({ chave = 'fulano@email.com', valor = null, nome = 'FULANO DE TAL',
                      cidade = 'CAMPO GRANDE', txid = '***', dinamico = false } = {}) {
  const t = (tag, v) => tag + String(v.length).padStart(2, '0') + v;
  const conta = t('00', 'BR.GOV.BCB.PIX') + t('01', chave);

  let p = t('00', '01');
  if (dinamico) p += t('01', '12');
  p += t('26', conta) + t('52', '0000') + t('53', '986');
  if (valor) p += t('54', valor.toFixed(2));
  p += t('58', 'BR') + t('59', nome) + t('60', cidade) + t('62', t('05', txid));
  p += '6304';
  return p + crc16(p);
}

/** Fecha uma chave de acesso de 44 dígitos calculando o DV (módulo 11). */
export function chaveNFe(prefixo43) {
  let peso = 2;
  let soma = 0;
  for (let i = 42; i >= 0; i--) {
    soma += Number(prefixo43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const r = soma % 11;
  return prefixo43 + (r === 0 || r === 1 ? 0 : 11 - r);
}

// UF 50 (MS), emitida em 26/08, CNPJ 12345678000195, modelo 65, série 001, nº 42
const CHAVE = chaveNFe('5026081234567800019565001000000042100000001');

export const CASOS = [
  {
    nome: 'Pix estático com valor',
    entrada: pix({ valor: 25.9 }),
    espera: { tipo: 'pix', valor: 25.9, quem: 'FULANO DE TAL', metodo: 'pix' },
  },
  {
    nome: 'Pix estático sem valor (adesivo do balcão)',
    entrada: pix({ valor: null }),
    espera: { tipo: 'pix', valor: null, quem: 'FULANO DE TAL' },
  },
  {
    nome: 'Pix dinâmico — valor mora no banco, não no QR',
    entrada: pix({ dinamico: true, txid: 'PEDIDO123' }),
    espera: { tipo: 'pix', valor: null },
  },
  {
    nome: 'Pix com CRC corrompido ainda lê, mas avisa',
    entrada: pix({ valor: 10 }).slice(0, -4) + 'FFFF',
    espera: { tipo: 'pix', valor: 10, temAviso: 'verificador' },
  },
  {
    nome: 'NFC-e QR versão 1 — traz vNF',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?chNFe=${CHAVE}&nVersao=100&tpAmb=1`
           + '&dhEmi=2026-08-26T14%3A03%3A00-04%3A00&vNF=87.43&vICMS=5.10&digVal=abc&cIdToken=000001&cHashQRCode=xyz',
    espera: { tipo: 'nfce', valor: 87.43, data: '2026-08-26', metodo: null },
  },
  {
    nome: 'NFC-e QR versão 2 normal — 5 campos, sem valor',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?p=${CHAVE}|2|1|000001|a1b2c3d4`,
    espera: { tipo: 'nfce', valor: null, temAviso: 'não carrega o valor' },
  },
  {
    nome: 'NFC-e QR versão 2 em contingência — 9 campos, com valor',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?p=${CHAVE}|2|1|`
           + '323032362d30382d3236|150.00|9.90|digval|000001|a1b2c3d4',
    espera: { tipo: 'nfce', valor: 150, data: '2026-08-26' },
  },
  {
    nome: 'NFC-e sempre gera o mesmo id — ler duas vezes não duplica',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?p=${CHAVE}|2|1|000001|a1b2c3d4`,
    espera: { tipo: 'nfce', id: `nfce-${CHAVE}` },
  },
  {
    nome: 'Chave com dígito verificador errado avisa',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?chNFe=${CHAVE.slice(0, 43)}9&vNF=10.00`,
    espera: { tipo: 'nfce', temAviso: 'dígito verificador' },
  },
  {
    nome: 'CNPJ do emitente sai da própria chave',
    entrada: `https://www.dfe.ms.gov.br/nfce/qrcode?p=${CHAVE}|2|1|000001|a1b2c3d4`,
    espera: { tipo: 'nfce', cnpj: '12345678000195' },
  },
  {
    nome: 'Link do comprovante da maquininha não é reconhecido',
    entrada: 'https://comprovante.maquininha.com.br/v/9f3a2b1c',
    espera: null,
  },
  {
    nome: 'Texto solto não vira lançamento',
    entrada: 'OBRIGADO E VOLTE SEMPRE',
    espera: null,
  },
  {
    nome: 'Wi-Fi QR não vira lançamento',
    entrada: 'WIFI:S:MinhaRede;T:WPA;P:senha123;;',
    espera: null,
  },
];

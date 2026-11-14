import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { cleanText, isPendingMovement, isStatementTotal, normalize, statementAmount, statementDate } from './statementFormats.js';

GlobalWorkerOptions.workerSrc = workerUrl;

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WRITTEN_DATE = /^(\d{1,2})\s+(?:de\s+)?([a-zá-ú]{3,9})\.?\s+(?:de\s+)?(\d{4})(?=$|\s)/i;
const NUMERIC_DATE = /^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-](?:\d{4}|\d{2}))(?=$|[\s|])/;
const AMOUNTS = /(?<![\w/.,])(?:\(\s*)?(?:[+\-−–]\s*)?(?:R\$\s*)?(?:[+\-−–]\s*)?(?:\d{1,3}(?:,\d{3})+\.\d{2}|(?:\d{1,3}(?:[. ]\d{3})*|\d+)[.,]\d{2})(?![\d/.,])(?:\s*(?:CR|DR|C|D)(?=\s|[()|]|$)|\s*[−–+-](?=\s|$))?(?:\s*\))?/gi;
const COLUMN_NAMES = /\b(creditos?|debitos?|entradas?|saidas?|valor|saldo)\b/g;
const SECTION_BREAK = /^(?:saldo|total) (?:final|anterior|disponivel|do periodo|do mes|das movimentacoes)(?: |$)/;

function getLines(items) {
  const rows = [];
  const textItems = items.filter((item) => 'str' in item && cleanText(item.str))
    .sort((a, b) => b.transform[5] - a.transform[5]);
  for (const item of textItems) {
    const [,,,, x, y] = item.transform;
    const previous = rows.at(-1);
    if (previous && Math.abs(previous.y - y) <= 2) previous.parts.push({ x, width: item.width, text: cleanText(item.str) });
    else rows.push({ y, parts: [{ x, width: item.width, text: cleanText(item.str) }] });
  }
  return rows.map(({ parts }) => {
    let text = '';
    const runs = [];
    for (const part of parts.sort((a, b) => a.x - b.x)) {
      const start = text.length + (text ? 1 : 0);
      text += (text ? ' ' : '') + part.text;
      runs.push({ ...part, start, end: text.length });
    }
    return { text, runs };
  });
}

function textPosition(line, index) {
  const part = line.runs.find((run) => index >= run.start && index < run.end);
  return part ? part.x + (index - part.start) / part.text.length * part.width : null;
}

function amountColumns(line) {
  if (/\d[.,]\d{2}/.test(line.text)) return null;
  // Remove acentos preservando os índices para localizar cada cabeçalho na página.
  const label = line.text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const tags = [...label.matchAll(COLUMN_NAMES)];
  if (!tags.length || (tags.length < 2 && !/\b(?:data|historico|descricao|lancamentos?)\b/.test(label))) return null;
  return tags.map(([word], index) => ({
    word: word.replace(/s$/, ''),
    x: textPosition(line, tags[index].index + Math.floor(word.length / 2)),
  })).filter(({ x }) => x !== null);
}

function datePrefix(text) {
  const numeric = NUMERIC_DATE.exec(text);
  const written = WRITTEN_DATE.exec(text);
  if (!numeric && !written) return null;
  const raw = (numeric ?? written)[0];
  const month = written ? MONTHS.indexOf(normalize(written[2]).slice(0, 3)) + 1 : 0;
  if (written && !month) return null;

  try {
    const date = statementDate(numeric ? raw : [written[3], String(month).padStart(2, '0'), written[1]].join('-'));
    return { date, length: raw.length };
  } catch {
    return { date: null, length: raw.length };
  }
}

function labelDirection(title) {
  if (/\b(?:total de entradas|total de creditos|recebid[ao]s?|recebimento|deposito|credito em conta|estorno|reembolso|salario)\b/.test(title)) return 1;
  if (/\b(?:total de saidas|total de debitos|enviad[ao]s?|pagamento|compra|tarifa|saque|debito em conta)\b/.test(title)) return -1;
  return 0;
}

function pickAmount(line, start, columns) {
  const body = line.text.slice(start);
  const tokens = [...body.matchAll(AMOUNTS)].map((match) => {
    const index = match.index + start;
    const x = textPosition(line, index + Math.floor(match[0].trim().length / 2));
    const column = x === null ? null : columns.reduce((best, item) =>
      !best || Math.abs(item.x - x) < Math.abs(best.x - x) ? item : best, null);
    return { raw: match[0], index, column: column?.word };
  });
  const columnsKnown = columns.some(({ word }) => word !== 'saldo');
  const amounts = tokens.filter(({ column }) => !columnsKnown || column !== 'saldo');
  if (amounts.length !== 1) return null;
  return amounts[0];
}

async function extractMovements(document) {
  const rows = [];
  let ignored = 0;
  let textFound = false;
  let groupDate;
  let groupDirection = 0;
  let pendingSection = false;
  let columns = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const { items } = await page.getTextContent();
    const lines = getLines(items);
    textFound ||= lines.length > 0;

    for (const line of lines) {
      const prefix = datePrefix(line.text);
      const offset = prefix ? prefix.length : 0;
      const body = cleanText(line.text.slice(offset)).replace(/^[|\s]+/, '');
      const label = normalize(body);
      if (isPendingMovement(label) && !/\d[.,]\d{2}/.test(body)) {
        pendingSection = true;
        groupDate = null;
        groupDirection = 0;
        continue;
      }
      if (/^(?:lancamentos? efetivad[oa]s?|movimentacoes(?: do dia)?)(?: |$)/.test(label)) {
        pendingSection = false;
      }
      if (pendingSection || isPendingMovement(label)) continue;

      if (prefix && (!prefix.date || /^(?:a|ate|to)\s+\d/.test(label))) {
        groupDate = null;
        groupDirection = 0;
        continue;
      }

      if (prefix && (!label || isStatementTotal(label))) {
        groupDate = prefix.date;
        groupDirection = label.startsWith('total ') ? labelDirection(label) : 0;
        continue;
      }
      if (isStatementTotal(label)) {
        if (SECTION_BREAK.test(label)) {
          groupDate = null;
          groupDirection = 0;
        } else if (groupDate && label.startsWith('total ')) {
          groupDirection = labelDirection(label) || groupDirection;
        }
        continue;
      }
      if (/^(?:periodo(?: |$)|extrato(?: |$)|pagina \d)/.test(label)) continue;

      if (!prefix) {
        const header = amountColumns(line);
        if (header?.length) {
          columns = header;
          groupDate = null;
          groupDirection = 0;
          continue;
        }
      } else {
        groupDate = null;
        groupDirection = 0;
      }

      const date = prefix?.date ?? groupDate;
      if (!date) continue;
      const amountField = pickAmount(line, offset, columns);
      if (!amountField) {
        if (/\d[.,]\d{2}/.test(body)) ignored += 1;
        continue;
      }

      const title = cleanText(line.text.slice(offset, amountField.index)).replace(/^[| ]+|[| ]+$/g, '');
      if (!/[a-z]/.test(normalize(title))) {
        ignored += 1;
        continue;
      }
      try {
        const columnDirection = /^(?:debito|saida)$/.test(amountField.column) ? -1
          : /^(?:credito|entrada)$/.test(amountField.column) ? 1 : 0;
        const { amount, direction } = statementAmount(amountField.raw, columnDirection);
        const signed = amount * (direction || (!prefix && groupDirection) || labelDirection(normalize(title)));
        if (signed) rows.push({ date, title, signed, reference: '' });
        else if (amount) ignored += 1;
      } catch {
        ignored += 1;
      }
    }

    page.cleanup();
  }

  if (!textFound) throw new Error('O PDF está em imagem, sem texto selecionável. Baixe o extrato em OFX ou CSV no seu banco.');
  return { rows, ignored };
}

export async function readStatementPdf(data) {
  const task = getDocument({ data, useWasm: false, isEvalSupported: false, disableFontFace: true, useSystemFonts: false });
  try {
    const document = await task.promise;
    if (document.numPages > 80) throw new Error('O PDF tem mais de 80 páginas. Exporte um período menor.');
    return await extractMovements(document);
  } catch (error) {
    if (error.name === 'PasswordException') throw new Error('O PDF está protegido por senha. Exporte uma versão sem senha ou use OFX ou CSV.');
    if (error.name === 'InvalidPDFException') throw new Error('Não foi possível abrir esse PDF. Baixe novamente o extrato ou use OFX ou CSV.');
    throw error;
  } finally {
    await task.destroy().catch(() => {});
  }
}

import { useEffect, useRef, useState } from 'react';
import { dateLabel, money, number, sum } from '../lib/budget.js';
import { readBankStatement } from '../lib/statementFormats.js';
import { categoriesForRoute, categoryForRoute, identifyStatement, IMPORT_ROUTES, prepareStatementReview } from '../lib/statementImport.js';
import { Icon, IconButton, Modal, TextField } from './UI';

const PAGE_SIZE = 12;

function ReviewRow({ row, disabled, onChange }) {
  const routes = row.signed > 0 ? ['income'] : [
    'fixed', 'variable', 'grocery', ...(row.matches.length ? ['match'] : []),
  ];
  const categories = categoriesForRoute(row.route);
  const label = 'lançamento ' + row.reviewId;

  return (
    <article className="statement-row">
      <div className="statement-row-heading">
        <label className="statement-selection">
          <input className="form-check-input" type="checkbox" checked={row.selected}
            disabled={disabled || row.repeated} aria-label={'Importar ' + label}
            onChange={(event) => onChange({ selected: event.target.checked })} />
          <span className="statement-transaction">
            <strong>{row.route === 'match' ? row.sourceTitle : row.title || row.sourceTitle}</strong>
            <small>{dateLabel(row.date)}</small>
          </span>
        </label>
        <strong className={'statement-amount' + (row.signed > 0 ? ' positive-amount' : '')}>
          {row.signed > 0 ? '+' : '−'}{money(Math.abs(row.signed))}
        </strong>
      </div>
      {row.note && <p className="statement-row-note"><Icon name={row.repeated ? 'check2-circle' : 'info-circle'} />{row.note}</p>}
      {!row.repeated && (
        <div className="statement-fields">
          {routes.length > 1 ? (
            <div>
              <label className="form-label" htmlFor={'statement-route-' + row.reviewId}>Destino</label>
              <select className="form-select" id={'statement-route-' + row.reviewId} aria-label={'Destino do ' + label}
                value={row.route} disabled={disabled} onChange={(event) => {
                  const route = event.target.value;
                  onChange({ route, category: categoryForRoute(route, row.category || row.suggestedCategory) });
                }}>
                {routes.map((route) => <option key={route} value={route}>{IMPORT_ROUTES[route]}</option>)}
              </select>
            </div>
          ) : <span className="status status-paid statement-income-label">Renda</span>}
          {!!categories.length && (
            <div>
              <label className="form-label" htmlFor={'statement-category-' + row.reviewId}>Categoria</label>
              <select className="form-select" id={'statement-category-' + row.reviewId} aria-label={'Categoria do ' + label}
                value={row.category} disabled={disabled} onChange={(event) => onChange({ category: event.target.value })}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
          )}
          {row.route === 'match' ? (
            <div>
              <label className="form-label" htmlFor={'statement-match-' + row.reviewId}>Conta pendente</label>
              <select className="form-select" id={'statement-match-' + row.reviewId} aria-label={'Conta pendente do ' + label}
                value={row.matchId} disabled={disabled} onChange={(event) => onChange({ matchId: event.target.value })}>
                <option value="">Selecione uma conta</option>
                {row.matches.map((bill) => (
                  <option key={bill.id} value={bill.id}>{bill.title} · {dateLabel(bill.date)}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="statement-description-field">
              <TextField id={'statement-title-' + row.reviewId} label="Descrição" aria-label={'Descrição do ' + label}
                value={row.title} disabled={disabled} maxLength={150} onChange={(event) => onChange({ title: event.target.value })} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function StatementImport({ budget, onClose, onImport }) {
  const [filename, setFilename] = useState('');
  const [rows, setRows] = useState([]);
  const [ignored, setIgnored] = useState(0);
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(0);
  const reviewHeading = useRef(null);
  const focusPage = useRef(false);
  const busy = useRef(false);
  const latestBudget = useRef(budget);

  useEffect(() => { latestBudget.current = budget; }, [budget]);
  useEffect(() => () => { attempt.current += 1; }, []);
  useEffect(() => {
    if (focusPage.current) {
      reviewHeading.current?.focus();
      focusPage.current = false;
    }
  }, [page]);

  function changePage(next) {
    focusPage.current = next !== page;
    setPage(next);
  }

  async function read(event) {
    const file = event.target.files[0];
    if (!file || busy.current) return;

    const current = ++attempt.current;
    setFilename(file.name);
    setError('');
    setRows([]);
    setIgnored(0);
    setPage(0);
    setReading(true);
    try {
      const result = await readBankStatement(file);
      const identified = await identifyStatement(result);
      if (current !== attempt.current) return;
      setRows(prepareStatementReview(identified, latestBudget.current));
      setIgnored(result.ignored);
    } catch (readError) {
      if (current === attempt.current) setError(readError.message || 'Não foi possível ler o extrato.');
    } finally {
      if (current === attempt.current) setReading(false);
    }
  }

  function changeRow(reviewId, patch) {
    setRows((current) => current.map((row) => row.reviewId === reviewId ? { ...row, ...patch } : row));
    setError('');
  }

  const selected = rows.filter((row) => row.selected);
  const credits = sum(selected, (row) => Math.max(row.signed, 0));
  const debits = sum(selected, (row) => Math.max(-row.signed, 0));
  const reviewCount = rows.filter((row) => !row.selected && !row.repeated).length;
  const repeatedCount = rows.filter((row) => row.repeated).length;
  const pageCount = Math.ceil(rows.length / PAGE_SIZE);

  async function submit(event) {
    event.preventDefault();
    if (busy.current || reading || !selected.length) return;
    const missing = selected.find((row) => row.route === 'match' ? !row.matchId : !row.title.trim());
    if (missing) {
      changePage(Math.floor((missing.reviewId - 1) / PAGE_SIZE));
      setError('Complete a descrição ou escolha a conta pendente do lançamento ' + missing.reviewId + '.');
      return;
    }
    const matching = selected.filter((row) => row.route === 'match');
    if (new Set(matching.map((row) => row.matchId)).size !== matching.length) {
      setError('A mesma conta pendente aparece em dois lançamentos selecionados. Escolha um deles para dar baixa.');
      return;
    }

    setError('');
    busy.current = true;
    setSaving(true);
    try {
      await onImport(selected);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <Modal title="Importar extrato bancário" onClose={onClose} locked={saving} className="statement-dialog" wide>
      <form onSubmit={submit}>
        <div className="modal-body">
          <section className="scan-box statement-upload">
            <div className="scan-heading">
              <span className="metric-icon metric-icon-income"><Icon name="file-earmark-arrow-up" /></span>
              <div><h3>Extrato da conta em reais</h3><p>Selecione OFX, CSV ou PDF com texto selecionável, de até 12 MB.</p></div>
            </div>
            <TextField id="statement-file" label="Arquivo do extrato" type="file" accept=".ofx,.csv,.pdf"
              aria-describedby="statement-privacy" onClick={(event) => { event.currentTarget.value = ''; }}
              onChange={read} disabled={saving} />
            <p className="form-text" id="statement-privacy"><Icon name="shield-lock" /> O arquivo é lido no navegador. Só os lançamentos confirmados são salvos.</p>
          </section>
          {reading && <p className="support-line" role="status"><Icon name="hourglass-split" />Lendo {filename}…</p>}
          {rows.length > 0 && (
            <section aria-label="Revisão do extrato">
              <div className="statement-summary">
                <div>
                  <h3 ref={reviewHeading} tabIndex={-1}>Revise os lançamentos</h3>
                  <p className="statement-filename">{filename} · {number(rows.length)} {rows.length === 1 ? 'lançamento lido' : 'lançamentos lidos'}</p>
                </div>
                <dl className="statement-totals">
                  <div><dt>Entradas selecionadas</dt><dd>{money(credits)}</dd></div>
                  <div><dt>Saídas selecionadas</dt><dd>{money(debits)}</dd></div>
                </dl>
              </div>
              {(ignored > 0 || repeatedCount > 0 || reviewCount > 0) && (
                <p className="statement-notices" role="status">
                  {[
                    ignored ? number(ignored) + (ignored === 1 ? ' linha não importável' : ' linhas não importáveis') : '',
                    repeatedCount ? number(repeatedCount) + (repeatedCount === 1 ? ' duplicata detectada' : ' duplicatas detectadas') : '',
                    reviewCount ? number(reviewCount) + (reviewCount === 1 ? ' item fora da seleção' : ' itens fora da seleção') : '',
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="statement-list">
                {rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row) => (
                  <ReviewRow key={row.reviewId} row={row} disabled={saving} onChange={(patch) => changeRow(row.reviewId, patch)} />
                ))}
              </div>
              {pageCount > 1 && (
                <div className="statement-pagination">
                  <IconButton icon="chevron-left" label="Página anterior do extrato" disabled={saving || page === 0}
                    onClick={() => changePage(page - 1)} />
                  <span>Página {number(page + 1)} de {number(pageCount)}</span>
                  <IconButton icon="chevron-right" label="Próxima página do extrato" disabled={saving || page === pageCount - 1}
                    onClick={() => changePage(page + 1)} />
                </div>
              )}
            </section>
          )}
        </div>
        {error && <p className="alert alert-danger statement-error" role="alert">{error}</p>}
        <div className="modal-footer">
          <button type="button" className="btn btn-outline-cash" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn btn-cash" disabled={reading || saving || !selected.length}>
            {saving ? 'Importando…' : selected.length ? 'Importar ' + number(selected.length) + (selected.length === 1 ? ' lançamento' : ' lançamentos') : 'Importar lançamentos'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

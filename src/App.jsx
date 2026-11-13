import { useEffect, useRef, useState } from 'react';
import { Bills, Income } from './components/Accounts';
import Dashboard, { TipList } from './components/Dashboard';
import Editor from './components/Editor';
import Goals from './components/Goals';
import Groceries from './components/Groceries';
import { Icon, IconButton, Modal, PanelTitle, TextField } from './components/UI';
import { useBudget } from './hooks/useBudget';
import { money, monthLabel, saveRecord, shiftMonth, summarize, tipsFor, today } from './lib/budget';

const SCREENS = [
  { key: 'visao-geral', label: 'Visão geral', icon: 'grid-1x2', description: 'Acompanhe seu orçamento doméstico e planeje o que sobra.' },
  { key: 'rendas', label: 'Rendas', icon: 'wallet2', description: 'Cadastre seu salário e acompanhe as outras entradas do mês.', action: ['income', 'Nova renda extra'] },
  { key: 'despesas', label: 'Despesas fixas', icon: 'receipt', description: 'Organize as contas de casa, os vencimentos e os pagamentos.', action: ['bill', 'Nova despesa'] },
  { key: 'feira', label: 'Feira do mês', icon: 'basket2', description: 'Registre suas compras e estime quanto reservar para o supermercado.', action: ['grocery', 'Nova compra'] },
  { key: 'metas', label: 'Cofrinho', icon: 'piggy-bank', description: 'Acompanhe seus objetivos e registre quanto guardou.', action: ['goal', 'Nova meta'] },
  { key: 'assistente', label: 'Assistente de economia', icon: 'lightbulb', description: 'Dicas automáticas geradas pelos lançamentos do mês selecionado.' },
];

const LAUNCHERS = [
  ['salary', 'wallet2', 'Salário mensal'],
  ['income', 'plus-circle', 'Renda extra'],
  ['bill', 'receipt', 'Despesa fixa'],
  ['grocery', 'basket2', 'Compra de feira'],
  ['goal', 'bullseye', 'Meta de economia'],
  ['scan', 'upc-scan', 'Escanear nota fiscal'],
];

const LISTS = { income: 'income', bill: 'bills', grocery: 'groceries', goal: 'goals' };
const MIN_MONTH = '1900-01';
const MAX_MONTH = '2100-12';

function getScreen() {
  return SCREENS.find((screen) => '#' + screen.key === window.location.hash) ?? SCREENS[0];
}

function Sidebar({ screen, open, close, restoreFocus, closeButton }) {
  return (
    <>
      {open && <button type="button" className="sidebar-backdrop" onClick={restoreFocus} aria-label="Fechar menu lateral" tabIndex={-1} />}
      <aside className={'sidebar' + (open ? ' sidebar-open' : '')} id="cashmap-navigation">
        <a href="#visao-geral" className="brand" onClick={close}>
          <img src={import.meta.env.BASE_URL + 'cashmap-icon.svg'} alt="" width="44" height="44" />
          <span>CashMap</span>
        </a>
        <button ref={closeButton} type="button" className="btn icon-button drawer-close"
          aria-label="Fechar navegação" onClick={restoreFocus}><Icon name="x-lg" /></button>
        <div className="sidebar-divider" />
        <nav className="nav nav-pills flex-column sidebar-links" aria-label="Menu principal">
          {SCREENS.map((item) => (
            <a className={'nav-link' + (screen.key === item.key ? ' active' : '')} key={item.key}
              href={'#' + item.key} aria-current={screen.key === item.key ? 'page' : undefined} onClick={close}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-footer"><Icon name="hdd" /><span>Dados salvos neste navegador</span></div>
      </aside>
    </>
  );
}

function MonthPicker({ period, onChange, open }) {
  return (
    <div className="month-picker" aria-label="Mês do orçamento">
      <IconButton icon="chevron-left" label="Mês anterior" disabled={period <= MIN_MONTH}
        onClick={() => onChange(shiftMonth(period, -1))} />
      <button className="btn month-name" type="button" onClick={open} aria-label={'Selecionar mês. Atual: ' + monthLabel(period)}>
        <Icon name="calendar3" /><span>{monthLabel(period)}</span>
      </button>
      <IconButton icon="chevron-right" label="Próximo mês" disabled={period >= MAX_MONTH}
        onClick={() => onChange(shiftMonth(period, 1))} />
    </div>
  );
}

function PeriodDialog({ period, currentMonth, onChange, onClose }) {
  const [value, setValue] = useState(period);
  const [invalid, setInvalid] = useState(false);
  return (
    <Modal title="Selecionar mês" onClose={onClose}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= MIN_MONTH && value <= MAX_MONTH) {
          onChange(value);
          onClose();
        } else {
          setInvalid(true);
        }
      }}>
        <div className="modal-body">
          <TextField id="selected-month" label="Mês do orçamento" type="month" required value={value} placeholder="AAAA-MM"
            min={MIN_MONTH} max={MAX_MONTH} autoFocus onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }} />
          {invalid && <p role="alert" className="alert alert-danger modal-alert">Informe um mês entre janeiro de 1900 e dezembro de 2100 no formato AAAA-MM.</p>}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline-cash" onClick={() => { onChange(currentMonth); onClose(); }}>Ir para o mês atual</button>
          <button type="submit" className="btn btn-cash">Aplicar</button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ config, onClose, onConfirm }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const name = config.record.title ?? config.record.name ?? 'aporte de ' + money(config.record.amount);

  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Modal title={'Excluir ' + name + '?'} onClose={onClose} locked={busy}>
      <div className="modal-body">
        <p className="confirm-copy">{config.kind === 'goal'
          ? 'A meta e seus aportes serão removidos. O saldo dos meses com aportes será recalculado.'
          : 'O lançamento será removido dos totais do CashMap.'}</p>
        {error && <p role="alert" className="alert alert-danger modal-alert">{error}</p>}
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-outline-cash" onClick={onClose} disabled={busy} autoFocus>Cancelar</button>
        <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>{busy ? 'Excluindo…' : 'Excluir'}</button>
      </div>
    </Modal>
  );
}

function Assistant({ tips }) {
  return (
    <section className="card cash-card section-panel">
      <PanelTitle title="Sugestões para o seu orçamento">
        <span className="assistant-mark" aria-hidden="true"><Icon name="lightbulb" /></span>
      </PanelTitle>
      <TipList tips={tips} />
      <p className="support-line"><Icon name="info-circle" />As sugestões são simuladas por regras locais que usam os valores cadastrados.</p>
    </section>
  );
}

function saveChange(budget, config, record) {
  const { kind, period, record: previous, goal } = config;
  if (kind === 'salary') return { ...budget, salaries: { ...budget.salaries, [period]: record.amount } };
  if (kind === 'deposit') {
    const storedGoal = budget.goals.find((item) => item.id === goal.id);
    if (!storedGoal) throw new Error('A meta foi removida em outra aba.');
    const deposits = saveRecord(storedGoal.deposits, record, previous?.id);
    return { ...budget, goals: saveRecord(budget.goals, { deposits }, goal.id) };
  }
  const list = LISTS[kind];
  const entry = kind === 'goal' && !previous ? { ...record, deposits: [] } : record;
  return { ...budget, [list]: saveRecord(budget[list], entry, previous?.id) };
}

function removeChange(budget, config) {
  const { kind, record, goal } = config;
  if (kind === 'deposit') {
    const storedGoal = budget.goals.find((item) => item.id === goal.id);
    if (!storedGoal) throw new Error('A meta foi removida em outra aba.');
    const deposits = storedGoal.deposits.filter((deposit) => deposit.id !== record.id);
    return { ...budget, goals: saveRecord(budget.goals, { deposits }, goal.id) };
  }
  const list = LISTS[kind];
  return { ...budget, [list]: budget[list].filter((entry) => entry.id !== record.id) };
}

export default function App() {
  const { budget, isExample, storageError, update } = useBudget();
  const [currentDate, setCurrentDate] = useState(today);
  const [period, setPeriod] = useState(() => today().slice(0, 7));
  const [screen, setScreen] = useState(getScreen);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(false);
  const title = useRef(null);
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const exportLock = useRef(false);
  const summary = summarize(budget, period, currentDate);
  const tips = tipsFor(summary, currentDate);
  const currentMonth = currentDate.slice(0, 7);

  useEffect(() => {
    function navigate() {
      setScreen(getScreen());
      setDrawer(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    }
    function refreshDate() { setCurrentDate(today()); }
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener('hashchange', navigate);
    window.addEventListener('focus', refreshDate);
    return () => {
      window.removeEventListener('hashchange', navigate);
      window.removeEventListener('focus', refreshDate);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 6500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function closeDrawer() {
    setDrawer(false);
    requestAnimationFrame(() => menuButton.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    if (!drawer) return undefined;
    closeButton.current?.focus();
    function escape(event) {
      if (event.key === 'Escape') closeDrawer();
    }
    const desktop = window.matchMedia('(min-width: 992px)');
    function dismissOnDesktop(event) {
      if (event.matches) setDrawer(false);
    }
    window.addEventListener('keydown', escape);
    desktop.addEventListener('change', dismissOnDesktop);
    return () => {
      window.removeEventListener('keydown', escape);
      desktop.removeEventListener('change', dismissOnDesktop);
    };
  }, [drawer]);

  function notify(text, error = false) { setNotice({ text, error }); }
  function close() { setModal(null); }
  function edit(kind, record = null, scan = false, goal = null) {
    if (kind === 'salary' && !isExample && Object.hasOwn(budget.salaries, period)) record = { amount: summary.salary };
    setModal({ type: 'edit', kind, record, period, scan, goal });
  }
  function remove(kind, record, goal = null) { setModal({ type: 'delete', kind, record, goal }); }

  async function start() {
    try {
      await update((latest) => latest);
      notify('Seu orçamento está pronto para receber lançamentos.');
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function toggleBill(bill) {
    const status = bill.status === 'paid' ? 'pending' : 'paid';
    try {
      await update((latest) => ({ ...latest, bills: saveRecord(latest.bills, { status }, bill.id) }));
      notify(status === 'paid' ? 'Conta marcada como paga.' : 'Conta marcada como pendente.');
    } catch (error) {
      notify(error.message, true);
    }
  }

  async function exportPdf() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    try {
      const { downloadReport } = await import('./lib/report');
      await downloadReport(summary, tips, currentDate, isExample);
      notify('Relatório PDF gerado.');
    } catch {
      notify('O PDF não pôde ser gerado. Tente novamente.', true);
    } finally {
      exportLock.current = false;
      setExporting(false);
    }
  }

  const moduleProps = { summary, onEdit: edit, onDelete: remove, isExample };

  return (
    <div className="app-shell">
      <Sidebar screen={screen} open={drawer} close={() => { if (drawer) closeDrawer(); }}
        restoreFocus={closeDrawer} closeButton={closeButton} />
      <div className="workspace" inert={drawer}>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="topbar-label">
              <button ref={menuButton} className="btn icon-button menu-button" type="button" aria-label={drawer ? 'Fechar menu' : 'Abrir menu'}
                aria-expanded={drawer} aria-controls="cashmap-navigation" onClick={() => setDrawer((open) => !open)}><Icon name="list" /></button>
              <span className="topbar-brand"><Icon name="house-door" />Orçamento doméstico</span>
            </div>
            <div className="topbar-actions">
              <button className="btn btn-outline-cash export-button" type="button" onClick={exportPdf} disabled={exporting}
                aria-label={exporting ? 'Gerando PDF' : 'Exportar PDF'}><Icon name="file-earmark-arrow-down" />
                <span>{exporting ? 'Gerando…' : 'Exportar PDF'}</span>
              </button>
              <button className="btn btn-cash launch-button" type="button" onClick={() => setModal({ type: 'launch' })} aria-label="Novo lançamento">
                <Icon name="plus-lg" /><span>Novo lançamento</span>
              </button>
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div><h1 ref={title} tabIndex={-1}>{screen.label}</h1><p>{screen.description}</p></div>
            <div className="page-actions">
              <MonthPicker period={period} onChange={setPeriod} open={() => setModal({ type: 'period' })} />
              {screen.action && <button className="btn btn-cash" type="button" onClick={() => edit(screen.action[0])}>
                <Icon name="plus-lg" />{screen.action[1]}
              </button>}
            </div>
          </div>
          {storageError && <div className="alert alert-danger" role="alert">{storageError}</div>}
          {isExample && <div className="example-banner">
            <div><Icon name="info-circle" /><p><strong>Dados de exemplo.</strong> Cadastre um lançamento para iniciar seu orçamento.</p></div>
            <button type="button" onClick={start}>Começar do zero<Icon name="arrow-right" /></button>
          </div>}
          {screen.key === 'visao-geral' && <Dashboard summary={summary} tips={tips} currentDate={currentDate} />}
          {screen.key === 'rendas' && <Income {...moduleProps} />}
          {screen.key === 'despesas' && <Bills {...moduleProps} currentDate={currentDate} onToggle={toggleBill} />}
          {screen.key === 'feira' && <Groceries {...moduleProps} />}
          {screen.key === 'metas' && <Goals {...moduleProps} />}
          {screen.key === 'assistente' && <Assistant tips={tips} />}
        </main>
      </div>
      {notice && <div className={'notice' + (notice.error ? ' notice-error' : '')} role={notice.error ? 'alert' : 'status'}>
        <Icon name={notice.error ? 'exclamation-circle' : 'check-circle'} /><span>{notice.text}</span>
        <IconButton icon="x-lg" label="Dispensar aviso" onClick={() => setNotice(null)} />
      </div>}
      {modal?.type === 'launch' && <Modal title="Novo lançamento" description="Escolha o que deseja registrar." onClose={close}>
        <div className="modal-body launcher-list">
          {LAUNCHERS.map(([kind, icon, label]) => <button className="btn launcher-option" type="button" key={kind}
            onClick={() => edit(kind === 'scan' ? 'grocery' : kind, null, kind === 'scan')}>
            <span><Icon name={icon} />{label}</span><Icon name="chevron-right" />
          </button>)}
        </div>
      </Modal>}
      {modal?.type === 'period' && <PeriodDialog period={period} currentMonth={currentMonth} onChange={setPeriod} onClose={close} />}
      {modal?.type === 'edit' && <Editor config={modal} onClose={close} onSave={async (record) => {
        await update((latest) => saveChange(latest, modal, record));
        notify('Lançamento salvo.');
      }} />}
      {modal?.type === 'delete' && <DeleteDialog config={modal} onClose={close} onConfirm={async () => {
        await update((latest) => removeChange(latest, modal));
        notify('Registro excluído.');
      }} />}
    </div>
  );
}

import { useEffect, useRef } from 'react';

export function Icon({ name, className = '' }) {
  return <i className={'bi bi-' + name + ' ' + className} aria-hidden="true" />;
}

export function IconButton({ icon, label, onClick, danger = false, disabled = false }) {
  return (
    <button type="button" className={'btn icon-button' + (danger ? ' icon-button-danger' : '')}
      onClick={onClick} title={label} aria-label={label} disabled={disabled}>
      <Icon name={icon} />
    </button>
  );
}

export function PanelTitle({ title, description, children }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, children }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} /></span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

export function ActionLink({ href, children }) {
  return <a className="action-link" href={href}>{children}<Icon name="arrow-right" /></a>;
}

export function Status({ status, date, currentDate }) {
  if (status === 'paid') return <span className="status status-paid">Pago</span>;
  if (date < currentDate) return <span className="status status-overdue">Pendente · vencida</span>;
  return <span className="status status-pending">Pendente</span>;
}

export function Modal({ title, description, onClose, locked = false, wide = false, className = '', children }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      if (element.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className={['cash-dialog', wide && 'cash-dialog-wide', className].filter(Boolean).join(' ')}
      aria-labelledby="modal-title" onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}>
      <div className="modal-header">
        <div>
          <h2 id="modal-title">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <IconButton icon="x-lg" label="Fechar" onClick={onClose} disabled={locked} />
      </div>
      {children}
    </dialog>
  );
}

export function TextField({ label, id, ...props }) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <input className="form-control" id={id} {...props} />
    </div>
  );
}

export function AmountField({ label, id, ...props }) {
  return (
    <div>
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="input-group">
        <span className="input-group-text">R$</span>
        <input className="form-control" id={id} inputMode="decimal" placeholder="0,00" maxLength={16} {...props} />
      </div>
    </div>
  );
}

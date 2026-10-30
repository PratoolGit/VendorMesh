import { useEffect, useId, useMemo, useRef, useState } from 'react';

const cx = (...values) => values.filter(Boolean).join(' ');

/**
 * Small design-system primitives for VendorMesh screens.
 * They intentionally contain presentation only; callers own data and workflows.
 */
export function Button({ variant = 'primary', size = 'md', type = 'button', className = '', children, ...props }) {
  return (
    <button
      type={type}
      className={cx('vm-button', 'vm-button--' + variant, 'vm-button--' + size, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', dot = false, className = '', children, ...props }) {
  return (
    <span className={cx('vm-badge', 'vm-badge--' + tone, className)} {...props}>
      {dot && <span className="vm-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Card({ as: Element = 'section', interactive = false, className = '', children, ...props }) {
  return (
    <Element className={cx('vm-card', interactive && 'vm-card--interactive', className)} {...props}>
      {children}
    </Element>
  );
}

export function Input({ label, hint, error, id, className = '', inputClassName = '', ...inputProps }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = hint ? inputId + '-hint' : undefined;
  const errorId = error ? inputId + '-error' : undefined;
  const describedBy = [inputProps['aria-describedby'], errorId || hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('vm-field', className)}>
      {label && <label className="vm-field__label" htmlFor={inputId}>{label}</label>}
      <input
        {...inputProps}
        id={inputId}
        className={cx('vm-input', inputClassName)}
        aria-invalid={error ? 'true' : inputProps['aria-invalid']}
        aria-describedby={describedBy}
      />
      {error && <span className="vm-field__error" id={errorId} role="alert">{error}</span>}
      {!error && hint && <span className="vm-field__hint" id={hintId}>{hint}</span>}
    </div>
  );
}

export function Skeleton({ variant = 'text', width, height, className = '', ...props }) {
  const style = {
    ...(width !== undefined ? { width: typeof width === 'number' ? width + 'px' : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? height + 'px' : height } : {})
  };
  return <span aria-hidden="true" className={cx('vm-skeleton', 'vm-skeleton--' + variant, className)} style={style} {...props} />;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = 'right',
  width = '560px',
  children,
  className = ''
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = () => panelRef.current?.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(focusable() || []);
      if (!elements.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const firstElement = focusable()?.[0];
    (firstElement || panelRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="vm-sheet-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={panelRef}
        className={cx('vm-sheet', side === 'left' && 'vm-sheet--left', className)}
        style={{ '--vm-sheet-width': width }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="vm-sheet__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p className="vm-sheet__description" id={descriptionId}>{description}</p>}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">×</Button>
        </header>
        <div className="vm-sheet__body">{children}</div>
      </section>
    </div>
  );
}

export function CommandPalette({
  open,
  onClose,
  items = [],
  placeholder = 'Search commands and pages…'
}) {
  const inputRef = useRef(null);
  const dialogId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const haystack = [item.label, item.description, item.group, ...(item.keywords || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
      return undefined;
    }
    inputRef.current?.focus();
    return undefined;
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const activate = (item) => {
    if (!item || item.disabled) return;
    item.onSelect?.();
    onClose?.();
  };

  return (
    <div
      className="vm-command-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        className="vm-command"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        aria-describedby={dialogId}
      >
        <div className="vm-command__search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
              } else if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(matches.length - 1, 0)));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((index) => Math.max(index - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                activate(matches[activeIndex]);
              }
            }}
            aria-label="Search commands"
            aria-controls={dialogId}
            aria-autocomplete="list"
          />
          <kbd>ESC</kbd>
        </div>
        <div className="vm-command__list" id={dialogId} role="listbox" aria-label="Matching commands">
          {matches.length === 0 && <div className="vm-command__empty">No matching commands</div>}
          {matches.map((item, index) => (
            <button
              key={item.id || item.label}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="vm-command__item"
              disabled={Boolean(item.disabled)}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => activate(item)}
            >
              {item.icon && <span aria-hidden="true">{item.icon}</span>}
              <span className="vm-command__item-main">
                <strong>{item.label}</strong>
                {item.description && <small>{item.description}</small>}
              </span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

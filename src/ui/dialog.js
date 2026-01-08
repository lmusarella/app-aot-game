let _modalEls = null;

function resetModalActions() {
  const { modal, btnCancel, btnConfirm } = ensureModal();
  const actions = modal.querySelector('.modal-actions');
  actions.querySelector('.card-actions')?.remove();
  btnCancel.classList.remove('is-hidden');
  btnConfirm.classList.remove('is-hidden');
}

export function ensureModal() {
  if (_modalEls) return _modalEls;
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div'); modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-header">
      <div class="modal-title" id="dlg-title"></div>
      <button class="modal-close" id="dlg-close" type="button" aria-label="Chiudi">×</button>
    </div>
    <div class="modal-body" id="dlg-msg"></div>
    <div class="modal-actions">
      <button class="modal-btn" id="dlg-cancel">Annulla</button>
      <button class="modal-btn danger" id="dlg-confirm">Conferma</button>
    </div>
  `;
  document.body.append(backdrop, modal);
  _modalEls = {
    backdrop, modal,
    title: modal.querySelector('#dlg-title'),
    msg: modal.querySelector('#dlg-msg'),
    btnCancel: modal.querySelector('#dlg-cancel'),
    btnConfirm: modal.querySelector('#dlg-confirm'),
    btnClose: modal.querySelector('#dlg-close'),
  };
  return _modalEls;
}

function cancellabile(c) {
  return c ? '' : 'none';
}

function setStandardActions({ confirmText = 'OK', cancelText = 'Annulla', danger = false, cancellable = true } = {}) {
  const { btnCancel, btnConfirm, btnClose } = ensureModal();
  resetModalActions();
  btnConfirm.textContent = confirmText;
  btnConfirm.classList.toggle('danger', !!danger);
  btnCancel.textContent = cancelText;
  btnCancel.style.display = cancellabile(cancellable);
  btnClose.style.display = cancellabile(cancellable);
}

export function openDialog({
  title,
  message,
  confirmText = 'OK',
  cancelText = 'Annulla',
  danger = false,
  cancellable = true,
  detailed = false,
}) {
  const { backdrop, modal, title: ttl, msg, btnCancel, btnConfirm, btnClose } = ensureModal();
  ttl.textContent = title || '';
  msg.innerHTML = message || '';
  setStandardActions({ confirmText, cancelText, danger, cancellable });

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (ok, reason) => {
      if (resolved) return;
      resolved = true;
      backdrop.classList.remove('show'); modal.classList.remove('show');
      setTimeout(() => resolve(detailed ? { ok, reason } : ok), 100);
      document.removeEventListener('keydown', onKey);
      backdrop.removeEventListener('click', onBackdrop);
      btnCancel.onclick = btnConfirm.onclick = btnClose.onclick = null;
      resetModalActions();
    };

    const onKey = (e) => {
      if (e.key === 'Escape' && cancellable) finish(false, 'escape');
      if (e.key === 'Enter') finish(true, 'enter');
    };

    const onBackdrop = (e) => {
      if (e.target === backdrop && cancellable) finish(false, 'backdrop');
    };

    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', onBackdrop);

    btnCancel.onclick = () => finish(false, 'cancel-button');
    btnConfirm.onclick = () => finish(true, 'confirm-button');
    btnClose.onclick = () => finish(false, 'close-x');

    requestAnimationFrame(() => {
      backdrop.classList.add('show'); modal.classList.add('show');
    });
  });
}

export function confirmDialog(opts) { return openDialog({ ...opts, cancellable: true }); }

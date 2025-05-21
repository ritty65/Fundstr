import React from 'react';

export default function InvoiceModal({ invoice, onClose }) {
  if (!invoice) return null;
  return (
    <div className="modal show d-block" tabIndex="-1" role="dialog">
      <div className="modal-dialog">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Payment Invoice</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            <p style={{ wordBreak: 'break-all' }}>{invoice}</p>
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(invoice);
              }}
            >
              Copy to Clipboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

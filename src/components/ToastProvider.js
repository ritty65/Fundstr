import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, variant = 'primary') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, variant }]);
    setTimeout(() => {
      setToasts(t => t.filter(toast => toast.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback(id => {
    setToasts(t => t.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="position-fixed top-0 end-0 p-3"
        style={{ zIndex: 1070 }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast show text-bg-${t.variant} border-0 mb-2`}
            role="alert"
          >
            <div className="d-flex">
              <div className="toast-body">{t.message}</div>
              <button
                type="button"
                className="btn-close btn-close-white me-2 m-auto"
                onClick={() => removeToast(t.id)}
              ></button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

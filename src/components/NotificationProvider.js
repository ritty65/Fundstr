import React, { createContext, useContext, useState } from 'react';

const NotificationContext = createContext();

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [message, setMessage] = useState(null);

  function show(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <NotificationContext.Provider value={{ show }}>
      {children}
      {message && (
        <div
          style={{
            position: 'fixed',
            bottom: 20,
            right: 20,
            background: '#333',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 4,
            zIndex: 1000,
          }}
        >
          {message}
        </div>
      )}
    </NotificationContext.Provider>
  );
}

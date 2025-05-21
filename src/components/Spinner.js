import React from 'react';
import '../index.css';

export default function Spinner({ size = 24 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: '3px solid #ccc',
        borderTopColor: '#333',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
  );
}

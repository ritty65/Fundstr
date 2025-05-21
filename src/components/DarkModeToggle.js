import React from 'react';

export default function DarkModeToggle({ darkMode, onToggleDarkMode }) {
  return (
    <button onClick={onToggleDarkMode} aria-label="Toggle dark mode">
      {darkMode ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}

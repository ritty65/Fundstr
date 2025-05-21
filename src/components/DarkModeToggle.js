import React from 'react';
import styles from './DarkModeToggle.module.css';

export default function DarkModeToggle({ darkMode, onToggleDarkMode }) {
  return (
    <button
      className={styles.toggle}
      onClick={onToggleDarkMode}
      aria-label="Toggle dark mode"
    >
      {darkMode ? '☀️ Light' : '🌙 Dark'}
    </button>
  );
}

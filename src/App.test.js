import { render, screen } from '@testing-library/react';
import App from './App';

test('renders application header', () => {
  render(<App />);
  const header = screen.getByText(/Nostr Patreon MVP/i);
  expect(header).toBeInTheDocument();
});

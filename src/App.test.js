import { render, screen } from '@testing-library/react';
import App from './App';

test('renders Nostr Patreon MVP heading', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /Nostr Patreon MVP/i });
  expect(heading).toBeInTheDocument();
});

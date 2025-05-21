import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import KeyManager from './components/KeyManager';

beforeEach(() => {
  window.NostrTools = {
    nip06: {
      generateSeedWords: jest.fn(),
      privateKeyFromSeedWords: jest.fn(),
    },
    generatePrivateKey: jest.fn(),
    getPublicKey: jest.fn(),
    nip19: {
      nsecEncode: jest.fn(),
      npubEncode: jest.fn(),
    },
  };
});

afterEach(() => {
  delete window.NostrTools;
});

test('renders Key Manager heading', () => {
  render(<KeyManager />);
  expect(screen.getByRole('heading', { name: /Key Manager/i })).toBeInTheDocument();
});

test('generates a key pair when clicking the button', async () => {
  const user = userEvent.setup();
  window.NostrTools.nip06.generateSeedWords.mockReturnValue(['alpha', 'beta']);
  window.NostrTools.nip06.privateKeyFromSeedWords.mockReturnValue('priv');
  window.NostrTools.getPublicKey.mockReturnValue('pub');
  window.NostrTools.nip19.nsecEncode.mockReturnValue('nsec_test');
  window.NostrTools.nip19.npubEncode.mockReturnValue('npub_test');

  render(<KeyManager />);
  await user.click(screen.getByRole('button', { name: /Generate Key Pair/i }));

  expect(screen.getByText('nsec_test')).toBeInTheDocument();
  expect(screen.getByText('npub_test')).toBeInTheDocument();
});

test('restores a key from entered mnemonic', async () => {
  const user = userEvent.setup();
  window.NostrTools.nip06.privateKeyFromSeedWords.mockReturnValue('restored');
  window.NostrTools.getPublicKey.mockReturnValue('pub2');
  window.NostrTools.nip19.nsecEncode.mockReturnValue('nsec_restore');
  window.NostrTools.nip19.npubEncode.mockReturnValue('npub_restore');

  render(<KeyManager />);
  await user.type(screen.getByPlaceholderText(/seed words/i), 'one two');
  await user.click(screen.getByRole('button', { name: /Restore/i }));

  expect(screen.getByText('nsec_restore')).toBeInTheDocument();
  expect(screen.getByText('npub_restore')).toBeInTheDocument();
});

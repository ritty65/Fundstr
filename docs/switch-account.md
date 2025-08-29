# Switch Nostr account

Fundstr stores your current Nostr login in the `nostrSession` localStorage key (`cashu.nostr.session`).
To switch to a different account:

1. Clear the stored session:
   ```js
   localStorage.removeItem('cashu.nostr.session');
   ```
2. Reload the app. Fundstr will prompt you to connect again so you can approve the new account.

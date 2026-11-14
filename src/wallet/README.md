# src/wallet

Pure builders for Google Wallet loyalty objects (with rotating barcode) and Apple Wallet `pass.json`.
No keys, no signing, no network, no React Native imports: the Rewards server imports or copies these and does the
signing. Test: `npx tsx src/wallet/wallet.test.ts`. Full context and what the owner must provide: `docs/MEMBERSHIP.md`.

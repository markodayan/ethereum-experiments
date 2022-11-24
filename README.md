<div align="center">
<br />
    <img src="./assets/ethereum.png" alt="Ethereum" width="80" >

<br />
  <h2 align="center">Noob-Ethereum</h2>
  <p align="center">
    JavaScript utilities to help you understand how Ethereum works
    <br />
    <!-- <a href="https://github.com/othneildrew/Best-README-Template"><strong>Explore the docs »</strong></a>
    <br /> -->
    <!-- <br /> -->
    <!-- <a href="https://github.com/othneildrew/Best-README-Template">View Demo</a> -->
    ·
    <a href="https://github.com/markodayan/noob-ethereum/issues">Report Bug</a>
    ·
    <a href="https://github.com/markodayan/noob-ethereum/issues">Request Feature</a>
  </p>
</div>

<br />

<!-- ABOUT THE PROJECT -->

# About The Project

This repository was made to provide various utilities for interacting with Ethereum along with implementation of methods
highlighting crucial tasks conducted by in the permissionless environment inherent with blockchain networks.

The goal of this repository is to educate developers about how various aspects of Ethereum (and blockchain protocols in
general) and to provide modules to not re-invent the wheel when dealing with Ethereum.

# What Can I Do?

Currently, you can:

- Provide your own Infura/Alchemy API key and instantiate a provider to fetch a block by number (or the latest).
- Seed blocks into JSON files for later use.
- Verify merkle roots for block header or transaction tries.

# Getting Started

Install the package with:

```bash
npm i noob-ethereum
```

## Provider Use

You can instantiate a provider as shown below (you will require a JSON-RPC endpoint which you can get from your full
node or a JSON-RPC provider like Alchemy, Infura etc):

```typescript
import { Provider } from 'noob-ethereum';

// Insert RPC URL as argument (e.g. http://localhost:8545 for full node, or any Alchemy or Infura endpoint)
const { provider } = new Provider('<RPC-URL>');

/* Fetch latest block */
const block = await provider.getLatestBlock();
/* Fetch block by number */
const query = await provider.getBlockByNumber(12_964_760);

/* Seed latest block to JSON file (include full transaction objects)  */
await provider.seedLatestBlock(true, 'src/junk').then();

/* Seed block by number to JSON file (only include transaction hashes - preferable if you are not interested in transaction data) */
await provider.seedBlockByNumber(false, 12_964_760, 'src/junk').then();
```

# Other Dependencies

There are various parts of this repo that leave implementation of lower-level data structures to
[ethereumjs](https://github.com/ethereumjs/ethereumjs-monorepo) who have done an excellent job, this includes:

- Modified trie data structures (if you want to see some trie implementations, I am working on them in this
  [repository](https://github.com/markodayan/algorithms-etc.git))
- RLP utilities

The [ethers](https://github.com/ethers-io/ethers.js/) is also used for some minor utilities but we do not make use of
its provider classes which are implemented from scratch.

The [keccak](https://github.com/cryptocoinjs/keccak) package is used to access the specific SHA-3 hashing function used
in Ethereum.

<br />

<!-- LICENSE --->

# License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="right">(<a href="#top">back to top</a>)</p>

<!-- CONTACT --->

# Contact

Mark Odayan - [@mark_mkzo](https://twitter.com/mark_mkzo)

<p align="right">(<a href="#top">back to top</a>)</p>

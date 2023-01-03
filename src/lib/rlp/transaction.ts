import * as rlp from './rlp';
import createKeccakHash from 'keccak';

import { hexify, hexZeroPad } from '../utils/conversion';

/* ---------------------------- Internal Methods ---------------------------------- */

function convertToByteArray(field: string | any[]): any {
  const isNested = Array.isArray(field);
  const emptyArr = Array.isArray(field) && field.length === 0;

  if (emptyArr) return [];

  if (!isNested) {
    if (field === '0x0') {
      return Uint8Array.from([]);
    } else {
      return toByteArr(field as string);
    }
  } else {
    return convertToByteArray(field);
  }
}

function toByteArr(field: string) {
  const arr = [];
  const suffix = field.slice(2);
  const byteLength = Math.ceil(suffix.length / 2);
  const padded = hexZeroPad(field, byteLength).slice(2);

  for (let i = 0; i < padded.length; i += 2) {
    arr.push(parseInt(padded.slice(i, i + 2), 16));
  }

  return new Uint8Array(arr);
}

/* -------------------------------------------------------------------------------- */
/* ******************************************************************************** */
/* --------------------------- Methods to Expose ---------------------------------- */
/**
 *  Serialise a transaction via RLP-encoding scheme
 * @param {RawTransaction} tx - transaction object (can be legacy, 2930, 1559 type transaction bodies)
 * @returns {Buffer} - RLP-encoded transaction
 */
function serialiseTransaction(tx: RawTransaction): Buffer {
  const toByteTuple = (tuple: string[] | any[]): Uint8Array[] => {
    return tuple.map((field) => convertToByteArray(field));
  };

  switch (tx.type) {
    /* Legacy transaction */
    case '0x0':
    default: {
      const { nonce, gasPrice, gas, to, value, input, v, r, s } = tx as RawLegacyTransaction;
      const tuple = [nonce, gasPrice, gas, to, value, input, v, r, s];
      const byteTuple = toByteTuple(tuple);
      return Buffer.from(rlp.encode(byteTuple));
    }
    /* EIP-2930 transaction */
    case '0x1': {
      const { chainId, nonce, gasPrice, gas, to, value, input, accessList, v, r, s } = tx as Raw2930Transaction;
      const tuple = [chainId, nonce, gasPrice, gas, to, value, input, accessList, v, r, s];
      const byteTuple = toByteTuple(tuple);
      const encodedPayload = Buffer.from(rlp.encode(byteTuple));

      const type = Buffer.from('01', 'hex');
      return Buffer.concat([type, encodedPayload]);
    }

    /* EIP-1559 transaction */
    case '0x2': {
      const { chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, input, accessList, v, r, s } =
        tx as Raw1559Transaction;
      const tuple = [chainId, nonce, maxPriorityFeePerGas, maxFeePerGas, gas, to, value, input, accessList, v, r, s];
      const byteTuple = toByteTuple(tuple);
      const encodedPayload = Buffer.from(rlp.encode(byteTuple));

      const type = Buffer.from('02', 'hex');
      return Buffer.concat([type, encodedPayload]);
    }
  }
}

/**
 * Serialise an array of transaction objects via RLP-encoding scheme
 * @param {RawTransactions} arr - array of transaction objects
 * @returns {Buffer[]} - array of RLP-encoded transactions
 */
function serialiseTransactions(arr: RawTransactions): Buffer[] {
  return arr.map((tx) => serialiseTransaction(tx));
}

/**
 * Calculate transaction hash generated by a transaction object
 * @param {Raw Transaction} tx - transaction object (can be legacy, 2930, 1559 type transaction bodies)
 * @returns {string} - transaction hash computed
 */
function calculateTransactionHash(tx: RawTransaction): string {
  const serialised = serialiseTransaction(tx);

  return hexify(createKeccakHash('keccak256').update(serialised).digest('hex'));
}

/**
 * Calculate transaction hashes generated from an array of transactions provided
 * @param {RawTransactions} arr - array of transaction objects
 * @returns {string[]} - array of transaction hashes computed
 */
function calculateTransactionHashes(arr: RawTransactions): string[] {
  const hashes: string[] = [];

  if (typeof arr[0] !== 'string') {
    arr.forEach((t) => hashes.push(calculateTransactionHash(t as RawTransaction)));
  }

  return hashes;
}

/**
 * Given a raw block (with full transaction objects), return the calculated transaction hashes
 * @param {IRawBlock} block - raw block including full transaction records
 * @returns {string[]} - an array of transaction hash strings
 */
function calculateBlockTransactionHashes(block: IRawBlock): string[] {
  if (block.transactions[0] === 'string') {
    console.error(
      `Block supplied does not consist of an array of transaction objects corresponding to the 'transactions' key (possibly a condensed block with only transaction hashes)`
    );
    return [];
  }

  return calculateTransactionHashes(block.transactions as RawTransactions);
}

export {
  serialiseTransaction,
  serialiseTransactions,
  calculateTransactionHash,
  calculateTransactionHashes,
  calculateBlockTransactionHashes,
};

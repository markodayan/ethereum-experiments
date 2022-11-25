import axios, { AxiosInstance, AxiosResponse } from 'axios';
import range from 'lodash/range';
import async from 'async';
import { promisify } from 'util';

import * as dotenv from 'dotenv';
dotenv.config();
import { hexify } from '@lib/utils/conversion';
import { exportToJSONFile } from '@lib/utils/export';
import { LONDON_HARDFORK_BLOCK } from '@src/constants';
import { utils } from '@src/index';

interface ISeedBlock {
  blockNumber: number;
  path?: string;
}

declare module 'axios' {
  type AxiosReponse<T> = Promise<T>;
}

abstract class HttpClient {
  protected readonly instance: AxiosInstance;
  public url: string;

  public constructor(url: string) {
    this.url = url;
    this.instance = axios.create({
      baseURL: url,
    });

    this._initializeResponseInterceptor();
  }

  private _initializeResponseInterceptor(): void {
    this.instance.interceptors.response.use(this._handleResponse, this._handleError);
  }

  private _handleResponse = (data: AxiosResponse) => data;

  protected _handleError = (error: Error) => Promise.reject(error);
}

const config = {
  headers: {
    'Content-Type': 'application/json',
  },
};

class Provider extends HttpClient {
  private static instance: Provider;
  protected readonly config: { headers: { 'Content-Type': string } };
  public url: string;

  private constructor(url: string) {
    super(url);
    this.config = config;
  }

  public static getInstance(url?: string): Provider {
    if (!this.instance) {
      this.instance = new Provider(url!);
    }

    return this.instance;
  }

  /**
   * Fetch raw block by number via JSON-RPC
   * @param {string} blockNumber - 12396599
   * @param {boolean} verbose - true
   * @returns {Promise<IRawBlock>}
   */
  public async getBlockByNumber(blockNumber: number, verbose = false): Promise<IRawBlock> {
    // @ts-ignore
    if (isNaN(blockNumber) || blockNumber === '') {
      throw new Error('User supplied invalid string as block number');
    }

    if (+blockNumber < 0) {
      throw new Error('User supplied block number that does not exist');
    }

    const res = await this.instance.post(
      '',
      {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: [hexify(blockNumber), verbose],
        id: 0,
      },
      this.config
    );

    if (res.data.error?.code) {
      throw new Error(res.data.error.code);
    }

    const { result } = res.data;
    return result;
  }

  /**
   * Fetch latest raw block via JSON-RPC
   * @param {boolean} verbose - true
   * @returns {Promise<IRawBlock>}
   */
  public async getLatestBlock(verbose = false): Promise<IRawBlock> {
    const res = await this.instance.post(
      '',
      {
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', verbose],
        id: 0,
      },
      this.config
    );

    const { result } = res.data;
    return result;
  }

  /**
   * Generate JSON file of latest block
   * @param {boolean} verbose - flag to specify fetching full tx objects or just their hashes
   * @param {string} path - optional parameter to specify path from project root where to save JSON file
   */
  public async seedLatestBlock(verbose = false, path = 'src/seeder/blocks/1559') {
    const block = await this.getLatestBlock(verbose);
    const blockNumber = parseInt(block.number, 16);
    exportToJSONFile(block, blockNumber.toString(), path);
  }

  /**
   * Generate JSON file for a specific block
   * @param {number} num - decimal number of a block
   * @param {boolean} verbose - flag to specify fetching full tx objects or just their hashes
   * @param {string} path - optional parameter to specify path from project root where to save JSON file
   */
  public async seedBlockByNumber(verbose = false, num: number, path?: string) {
    if (!num) throw new Error('No block number specified');

    const block = await this.getBlockByNumber(num, verbose);

    if (!path) {
      path = num >= LONDON_HARDFORK_BLOCK ? 'src/seeder/blocks/1559' : 'src/seeder/blocks/legacy';
    }

    exportToJSONFile(block, num.toString(), path);
  }

  public async prepareBlockRangeQuery(starting: number, total: number) {
    const currentHead = utils.decimal((await this.getLatestBlock(false)).number);
    const startBlock = utils.decimal((await this.getBlockByNumber(starting, true)).number);

    if (startBlock + total > currentHead) {
      throw new Error('Range provided includes blocks that have not been added to the chain yet!');
    }

    return range(startBlock, startBlock + total, 1);
  }

  /* Fetch array block transactions in tuple form over a range of blocks (tuple includes stringified array of block number, transaction index, transaction hash) */
  private async _fetchTransactionsOverBlockRange(startingBlock: number, total: number) {
    const blockNumberArr = await this.prepareBlockRangeQuery(startingBlock, total);
    const txHashArr: any[][] = [];

    const fetchBlockClosure = async (n: number, i: number) => {
      const { transactions } = await this.getBlockByNumber(n, true);
      txHashArr[i] = [];
      (transactions as RawTransactions).map((t: RawTransaction) => {
        txHashArr[i].push([n, utils.decimal(t.transactionIndex), t.hash].toString());
      });
    };

    await Promise.all(blockNumberArr.map((n: any, i: number) => fetchBlockClosure(n, i)));
    return txHashArr as any;
  }

  /* Go over a specified number of blocks are return transaction tuples that match the from and to transacction fields  */
  private async _fetchTransactionsOverBlocksByInteraction(
    startingBlock: number,
    total: number,
    from: string,
    to: string
  ) {
    console.log('block:', startingBlock, 'total:', total);
    const blockNumberArr = await this.prepareBlockRangeQuery(startingBlock, total);
    let txHashArr: any[][] = [];

    const fetchBlockClosure = async (n: number, i: number) => {
      const { transactions } = await this.getBlockByNumber(n, true);
      txHashArr[i] = [];
      (transactions as RawTransactions).map((t: RawTransaction) => {
        if (t.from === from && t.to === to) {
          txHashArr[i].push([n, utils.decimal(t.transactionIndex), t.hash].toString());
        }
      });
    };

    await Promise.all(blockNumberArr.map((n: any, i: number) => fetchBlockClosure(n, i)));

    // Filter all the blocks that did not have those interactions
    txHashArr = txHashArr.filter((arr) => arr.length !== 0);

    return txHashArr as any;
  }

  // Process and handle millions of requests for ALL block transactions
  public async fetchTransactionsOverBlockRange(startingBlock: number, total: number, limit: number) {
    const CONCURRENT_LIMIT = limit;
    const start = Date.now();
    let result: any[][] = [];
    let params = await this.prepareBlockRangeQuery(startingBlock, total);
    let finalGroup: number[] = [];
    let progress = 0;

    const concGroupSize = Math.floor(params.length / CONCURRENT_LIMIT);

    if (params.length % CONCURRENT_LIMIT !== 0) {
      const sliceParam = -params.length % CONCURRENT_LIMIT;
      finalGroup = [...params.slice(sliceParam)];
      params = [...params.slice(0, sliceParam)];
      console.log('params.length:', params.length);
      console.log('finalGroup.length:', finalGroup.length);
    }

    for (let i = 0; i < params.length; i += CONCURRENT_LIMIT) {
      const arr = await this._fetchTransactionsOverBlockRange(startingBlock + i, CONCURRENT_LIMIT);
      result = result.concat(arr);
      progress += CONCURRENT_LIMIT;
      console.log(
        'Blocks downloaded:',
        `${progress}/${total}`,
        '| Progress:',
        ((100 * progress) / total).toFixed(1) + '%' + ' | ' + 'elapsed time: ',
        utils.minutes(Date.now() - start)
      );
    }

    if (finalGroup.length > 0) {
      const arr = await this._fetchTransactionsOverBlockRange(finalGroup[0], finalGroup.length);
      result = result.concat(arr);
      progress += finalGroup.length;
      console.log(
        'Blocks downloaded:',
        `${progress}/${total}`,
        '| Progress:',
        ((100 * progress) / total).toFixed(1) + '%' + ' | ' + 'elapsed time: ',
        utils.minutes(Date.now() - start)
      );
    }

    console.log('group length:', concGroupSize);
    console.log('final group length:', finalGroup.length);

    return result;
  }

  public async fetchTransactionsOverBlocksByInteraction(
    startingBlock: number,
    total: number,
    limit: number,
    from: string,
    to: string
  ) {
    const CONCURRENT_LIMIT = limit;
    const start = Date.now();
    let result: any[][] = [];
    let params = await this.prepareBlockRangeQuery(startingBlock, total);
    let finalGroup: number[] = [];
    let progress = 0;

    const concGroupSize = Math.floor(params.length / CONCURRENT_LIMIT);

    if (params.length % CONCURRENT_LIMIT !== 0) {
      const sliceParam = -params.length % CONCURRENT_LIMIT;
      finalGroup = [...params.slice(sliceParam)];
      params = [...params.slice(0, sliceParam)];
      console.log('params.length:', params.length);
      console.log('finalGroup.length:', finalGroup.length);
    }

    for (let i = 0; i < params.length; i += CONCURRENT_LIMIT) {
      const arr = await this._fetchTransactionsOverBlocksByInteraction(startingBlock + i, CONCURRENT_LIMIT, from, to);
      result = result.concat(arr);
      progress += CONCURRENT_LIMIT;
      console.log(
        'Blocks downloaded:',
        `${progress}/${total}`,
        '| Progress:',
        ((100 * progress) / total).toFixed(1) + '%' + ' | ' + 'elapsed time: ',
        utils.minutes(Date.now() - start)
      );
    }

    if (finalGroup.length > 0) {
      const arr = await this._fetchTransactionsOverBlocksByInteraction(finalGroup[0], finalGroup.length, from, to);
      result = result.concat(arr);
      progress += finalGroup.length;
      console.log(
        'Blocks downloaded:',
        `${progress}/${total}`,
        '| Progress:',
        ((100 * progress) / total).toFixed(1) + '%' + ' | ' + 'elapsed time: ',
        utils.minutes(Date.now() - start)
      );
    }

    console.log('group length:', concGroupSize);
    console.log('final group length:', finalGroup.length);

    return result;
  }
}
/*
 * Class that the developer will instantiate supplying provider name
 */
class ProviderClientInterface {
  public provider: Provider;

  constructor(url: string) {
    this.provider = Provider.getInstance(url);
  }
}

export default ProviderClientInterface;

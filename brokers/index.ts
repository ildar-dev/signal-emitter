import config from '../config.json';
import { TBroker } from '../types';

import TWS from './tws';
import MT5 from './mt5';

const brokers: { [key: string]: TBroker } = {
  MT5,
  TWS,
};

const broker = brokers[config.broker as keyof typeof brokers];

broker.starter();

export const handler = broker.handler;

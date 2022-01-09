import config from '../config.json';

import TWS from './tws/handler';
import MT5 from './mt5/handler';

const brokers = {
  MT5,
  TWS,
};

const broker = brokers[config.broker as keyof typeof brokers];

broker.start();

export const handler = broker.handler;

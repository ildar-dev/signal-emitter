import config from '../config.json';

import { handler as handlerTWS } from './tws/handler';
import { handler as handlerMT5 } from './mt5/handler';

const handlers = {
  MT5: handlerMT5,
  TWS: handlerTWS,
};

export const handler = handlers[config.broker as keyof typeof handlers];

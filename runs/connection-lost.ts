import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../handlers/tws/helpers';
import { handler } from '../handlers/tws/handler';

const messageBuy: TMessage = {
  price: 1,
  channelId: 'TEST_PNL4',
  contractType: ETypeContract.MARKET,
  type: EType.OPEN,
  orderId: 150,
  messageId: 0,
  action: EAction.BUY,
  ticker: 'EUR.USD',
  percentage: 1,
  takeProfit: 0.5,
};

const messageClose: TMessage = {
  price: 1,
  channelId: 'TEST_PNL4',
  contractType: ETypeContract.MARKET,
  type: EType.CLOSE,
  orderId: 150,
  messageId: 0,
  action: EAction.BUY,
  ticker: 'EUR.USD',
  percentage: 1,
};

sleep(3000)
.then(async _ => {
  await handler(messageBuy);
  console.log('HANDLER DONE');
})
.then(async () => {
  await sleep(1500);
  // await handler(messageClose);
  console.log('HANDLER 2 FINISH');
  // connect TWS and wait finish
})


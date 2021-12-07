import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../helpers/handler';
import { handler } from '../handler';

const messageBuy: TMessage = {
  price: 100,
  channelId: 'TEST_PNL4',
  contractType: ETypeContract.LIMIT,
  type: EType.OPEN,
  orderId: 170,
  messageId: 0,
  action: EAction.BUY,
  ticker: 'EUR.JPY',
  percentage: 0.1,
};

const messageClose: TMessage = {
  price: 1.3,
  channelId: 'TEST_PNL4',
  contractType: ETypeContract.LIMIT,
  type: EType.CLOSE,
  orderId: 170,
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


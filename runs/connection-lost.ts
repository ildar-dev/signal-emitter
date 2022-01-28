import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../brokers/tws/helpers';
import { handler } from '../brokers';
import { exit } from 'process';

const orderId = 27;
const channelId = 'TEST_MT5';
const ticker = 'EUR.USD';

const messageBuy: TMessage = {
  price: 0.2,
  channelId,
  contractType: ETypeContract.MARKET,
  type: EType.OPEN,
  orderId,
  messageId: 0,
  action: EAction.BUY,
  ticker,
  percentage: 1,
};

const messageClose: TMessage = {
  price: 1,
  channelId,
  contractType: ETypeContract.MARKET,
  type: EType.CLOSE,
  orderId,
  messageId: 0,
  action: EAction.BUY,
  ticker,
  percentage: 1,
};

sleep(8000)
.then(async () => {
  handler(messageBuy);
  console.log('HANDLER DONE');
  handler({...messageBuy, orderId: orderId + 1});
  console.log('HANDLER DONE 2');
  handler({...messageBuy, orderId: orderId + 2});
  console.log('HANDLER DONE 3');
})
.then(async () => {
  await sleep(4000);
  handler(messageClose);
  console.log('HANDLER 2 FINISH');
})


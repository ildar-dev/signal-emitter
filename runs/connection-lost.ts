import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../brokers/tws/helpers';
import { handler } from '../brokers';
import { exit } from 'process';

const orderId = 18;
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
  await handler(messageBuy);
  console.log('HANDLER DONE');
})
.then(async () => {
  await sleep(1500);
  await handler(messageClose);
  console.log('HANDLER 2 FINISH');
  exit(0);
})


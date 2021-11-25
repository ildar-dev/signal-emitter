import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../helpers/handler';
import { handler } from '../handler';

const anavaiableMessage: TMessage = {
  price: 0.1,
  channelId: 'TEST_ANAVAILABLE_PRICE',
  contractType: ETypeContract.LIMIT,
  type: EType.OPEN,
  orderId: 1,
  messageId: 0,
  action: EAction.BUY,
  ticker: 'EUR.USD',
};

sleep(3000)
.then(async _ => {
  await handler(anavaiableMessage);
  console.log('HANDLER DONE');
})
.then(async () => {
  await sleep(10000);// disconnect TWS
  await handler(anavaiableMessage);
  console.log('HANDLER 2 FINISH');
  // connect TWS and wait finish
})


import { TMessage, ETypeContract, EType, EAction } from '../types';

import { sleep } from '../helpers/handler';
import { handler } from '../handler';

const anavaiableMessage: TMessage = {
  price: 3,
  channelId: 'TEST_ANAVAILABLE_PRICE',
  contractType: ETypeContract.LIMIT,
  type: EType.CLOSE,
  orderId: 1,
  messageId: 0,
  action: EAction.BUY,
  ticker: 'EUR.USD',
  percentage: 1,
};

sleep(3000)
.then(async _ => {
  await handler(anavaiableMessage);
  console.log('HANDLER DONE');
})
.then(async () => {
  await sleep(30000);// disconnect TWS
  await handler(anavaiableMessage);
  console.log('HANDLER 2 FINISH');
  // connect TWS and wait finish
})


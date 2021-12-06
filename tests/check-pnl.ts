import { ExecutionDetail, ExecutionFilter, IBApiNext } from '@stoqey/ib';
import config from '../config.json';
import { sleep, formattedDate } from '../helpers/handler';
import { db } from '../mongodb';
import { EAction, EOrderType, TDocumentOrder } from '../types';

const ib = new IBApiNext(config.receiver);

const CLIENT_ID = 1;

ib.connect(CLIENT_ID);

const args = process.argv.slice(2);

const channelId = args[0] || 'TEST_PNL4';

const PERIOD_DAYS = +args[1] || 7;

const time = () => {
  const now = new Date().getTime();
  return new Date(now - (PERIOD_DAYS * 1000 * 60 * 60 * 24));
}

const filter: ExecutionFilter = {
  clientId: '0',
  time: formattedDate(time()),
};

const formatterExecDetails = (execDetails: ExecutionDetail[]): string => {
  return execDetails.map(_ => `${_.execution.time}: ${_.contract.localSymbol} – ${_.execution.price}; ${_.execution.orderId}`).join('\n');
}

const getColor = (isPositive: boolean): string => isPositive ? '\x1b[32m' : '\x1b[31m';
const zipMongoAndIbData = (execDetails: ExecutionDetail[], documents: TDocumentOrder[]) => {
  const joinedMongoOrders = documents.reduce<({ orderIdMessage: number, documents: TDocumentOrder[]} | null)[]>((acc, cur) => {
    const pairIndex = acc.findIndex(_ => _?.orderIdMessage === cur.orderIdMessage);
    if (pairIndex !== -1) {
      acc[pairIndex]?.documents.push(cur);
      return [...acc];
    }
    return [...acc, { orderIdMessage: cur.orderIdMessage, documents: [cur] }]
  }, []);
  console.log('____ P n L ___');
  let total = 0;
  joinedMongoOrders.forEach(mongoOrder => {
    const openOrder = mongoOrder?.documents.find(_ => _.orderType === EOrderType.OPEN);
    if (!openOrder) {
      return null;
    }
    const closeOrders = mongoOrder?.documents.filter(_ => _.orderType !== EOrderType.OPEN) as TDocumentOrder[];
    if (closeOrders?.length > 1) {
      console.error(openOrder?.orderIdMessage, 'THERE ARE CLOSE ORDER AFTER SL/TP ORDER');
    }
    if (!closeOrders.length) {
      return null;
    }
    const closeOrder = closeOrders[0];
    const openIbOrder = execDetails.find(_ => _.execution.orderId === openOrder?.orderId) as ExecutionDetail;
    const closeIbOrder = execDetails.find(_ => _.execution.orderId === closeOrder?.orderId) as ExecutionDetail;
    if (!openIbOrder || !closeIbOrder) {
      return null;
    }
    const pnl = +(((openIbOrder.execution.price as number) - (closeIbOrder.execution.price as number)) * (openOrder?.message.action === EAction.BUY ? 1 : -1) * (openOrder?.total as number)).toFixed(4);
    total += pnl;
    console.log(getColor(pnl > 0), `${openOrder?.orderIdMessage}: ${openOrder?.message.ticker} ${openOrder?.message.action}: ${pnl}`);
  });
  console.log(getColor(total > 0), `TOTAL FOR ${PERIOD_DAYS} DAYS: ${total} $`);
}

sleep(1000)
.then(async () => {
  const execDetails = await ib.getExecutionDetails(filter);
  console.log(formatterExecDetails(execDetails));
  const allOrders = await (db.collection(channelId).find({})).toArray() as TDocumentOrder[];
  console.log(allOrders.map(_ => `${_.orderId}, ${_.orderType}, ${_.orderIdMessage}`).join('\n'));
  zipMongoAndIbData(execDetails, allOrders);
  ib.disconnect();
});

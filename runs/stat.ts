import { ExecutionDetail, ExecutionFilter, IBApiNext } from '@stoqey/ib';
import config from '../config.json';
import { sleep, formattedDate, CURRENCY } from '../helpers/handler';
import { db } from '../mongodb';
import { EAction, EOrderType, TDocumentOrder } from '../types';
import { lastValueFrom, timeout, takeWhile, map } from 'rxjs';

const args = process.argv.slice(2);

const ib = new IBApiNext(config.receiver);

const CLIENT_ID = 1;

ib.connect(CLIENT_ID);

const tags = ['TotalCashValue'];

const channelId = args[0] || 'R2BC';

const PERIOD_DAYS = +args[1] || 7;

const time = () => {
  const now = new Date().getTime();
  return new Date(now - (PERIOD_DAYS * 1000 * 60 * 60 * 24));
}

const filter: ExecutionFilter = {
  clientId: '0',
  time: formattedDate(time()),
};

const getColor = (isPositive: boolean): string => isPositive ? '\x1b[32m' : '\x1b[31m';

const infoPnl = (execDetails: ExecutionDetail[], documents: TDocumentOrder[]) => {
  const joinedMongoOrders = documents.reduce<({ orderIdMessage: number, documents: TDocumentOrder[]} | null)[]>((acc, cur) => {
    const pairIndex = acc.findIndex(_ => _?.orderIdMessage === cur.orderIdMessage);
    if (pairIndex !== -1) {
      acc[pairIndex]?.documents.push(cur);
      return [...acc];
    }
    return [...acc, { orderIdMessage: cur.orderIdMessage, documents: [cur] }]
  }, []);
  let total = 0;
  let channelTotal = 0;
  const loggedInfoPnL = joinedMongoOrders.map(mongoOrder => {
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
    const pnl = +(((openIbOrder.execution.price as number) - (closeIbOrder.execution.price as number)) * (openOrder?.message.action === EAction.BUY ? 1 : -1) * (openOrder?.total as number)).toFixed(6);
    const channelPnl = closeOrder.message.extra?.expected?.price ? +(((openIbOrder.execution.price as number) - (closeOrder.message.extra?.expected?.price as number)) * (openOrder?.message.action === EAction.BUY ? 1 : -1) * (openOrder?.total as number)).toFixed(6) : 0;
    channelTotal += channelPnl;
    total += pnl;
    return {
      positive: pnl >= 0 ? '+' : '-',
      orderIdMessage: openOrder?.orderIdMessage,
      ticker: openOrder?.message.ticker,
      action: openOrder?.message.action,
      'PnL (real)': pnl,
      'PnL (channel)': channelPnl,
    };
  }).filter(_ => _);
  return {
    loggedInfoPnL,
    total,
    channelTotal,
  }
}

sleep(800)
.then(async () => {
  const openOrders = await ib.getAllOpenOrders();
  console.log('\x1b[1m', '\nOPEN TWS ORDERS');
  console.table(openOrders.map(_ => ({ orderId: _.orderId, ticker: _.contract.localSymbol, price: _.order.lmtPrice || _.order.auxPrice })));

  const execDetails = await ib.getExecutionDetails(filter);
  console.log('\x1b[1m', '\nEXECUTED TWS ORDERS');
  console.table(execDetails.map(_ => ({ orderId: _.execution.orderId, time: _.execution.time, ticker: _.contract.localSymbol, price: _.execution.price, side: _.execution.side })));
  
  const allOrders = await (db.collection(channelId).find({})).toArray() as TDocumentOrder[];
  console.log('\x1b[1m', '\nMONGODB ORDERS');
  console.table(allOrders.map(_ => ({ orderId: _.orderId, orderIdMessage: _.orderIdMessage, type: _.orderType })));

  const infoPnL = infoPnl(execDetails, allOrders);
  console.log('\x1b[1m', '\nPNL');
  console.table(infoPnL.loggedInfoPnL);
  console.log(`${getColor(infoPnL.total >= 0)}\x1b[5m`, `TOTAL PER ${PERIOD_DAYS} DAYS: ${infoPnL.total} | CHANNEL: ${infoPnL.channelTotal}`);

  console.log('\x1b[1m', '\nACCOUNT INFO');
  const t = (await lastValueFrom(ib.getAccountSummary('All', tags.join(','))
    .pipe(
      timeout(2000),
      map((_) => Array.from(Array.from(_.all, ([_name, value]) => value)[0], ([name, value]) => ({ name, value: value.get(CURRENCY)?.value }))),
      takeWhile((_) => (_.length < tags.length), true),
    )));
  console.table(t);
  ib.disconnect();
});

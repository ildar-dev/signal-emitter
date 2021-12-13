import { IBApiNext } from '@stoqey/ib';
import { TMessage, EType, EOrderType, TDocumentOrder } from './types';
import { getOpenOrder, sleep, getCloseOrder, getContract, getDocument, modificatePendingOrder, openPendingOrder } from './helpers/handler';
import { db } from './mongodb';
import { Logger, ELogLevel } from './logger';
import config from './config.json';

const CLIENT_ID = 0;

const RECONNECT_TIMEOUT = 1000;

const ib = new IBApiNext(config.receiver);

const logger = new Logger(ELogLevel.ALL, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

ib.connect(CLIENT_ID);

ib.error.subscribe((error) => {
  logger.add('', 'TWS', `${error.error.message}`);
});

export const handler = async (message: TMessage) => {
  const timeStart = performance.now();
  const logOrderId = message.orderId;
  const collection = db.collection(message.channelId);
  while (!ib.isConnected) {
    logger.add(logOrderId, 'CONNECTING...');
    ib.disconnect();
    ib.connect(CLIENT_ID);
    await sleep(RECONNECT_TIMEOUT);
  }
  const contract = getContract(message);
  switch (message.type) {
    case EType.OPEN: {
      let openOrderDb: TDocumentOrder | null = null;
      let stopLossOrderDb: TDocumentOrder | null = null;
      let takeProfitOrderDb: TDocumentOrder | null = null;
      if (message.price) {
        logger.add(logOrderId, 'OPEN');
        const order = getOpenOrder(message);
        openOrderDb = getDocument((await ib.placeNewOrder(contract, order)), EOrderType.OPEN, message, order.totalQuantity as number);
      }

      if (message.stopLoss) {
        stopLossOrderDb = await openPendingOrder(EOrderType.STOPLOSS, message, logger, ib, contract);
      }
      if (message.takeProfit) {
        takeProfitOrderDb = await openPendingOrder(EOrderType.TAKEPROFIT, message, logger, ib, contract);
      }

      await collection.insertMany(([openOrderDb, stopLossOrderDb, takeProfitOrderDb] as TDocumentOrder[]).filter(_ => _))
      break;
    }
    case EType.MODIFICATION: {
      if (message.takeProfit) {
        await modificatePendingOrder(EOrderType.TAKEPROFIT, message, logger, ib, contract, collection);
      }
      if (message.stopLoss) {
        await modificatePendingOrder(EOrderType.STOPLOSS, message, logger, ib, contract, collection);
      }
      break;
    }
    case EType.CLOSE: {
      const query = { orderIdMessage: message.orderId };
      const [openOrders, previousOrders]: [number[], TDocumentOrder[]] = await Promise.all([
        ib.getAllOpenOrders(),
        collection.find(query).toArray()
      ]).then(([openOrders, previousOrders]) => [openOrders.map(_ => _.orderId), previousOrders.filter(_ => _?.orderId && typeof _?.orderId === 'number') as TDocumentOrder[]]);
      const openOrder = previousOrders.find(_ => _.orderType === EOrderType.OPEN);
      const openOrderId = openOrder?.orderId;
      const pendingOrdersId = previousOrders.map(_ => _.orderId).filter(_ => _ !== openOrderId);

      if (openOrderId && // there is openOrderId
      !openOrders?.some(id => id === openOrderId)) // openOrderId was executed (not in openOrders)
      {
        if (!previousOrders.filter(_ => _.orderType !== EOrderType.OPEN).length) { // there are't pending orders
          const orderId = await ib.placeNewOrder(contract, getCloseOrder(message));
          await db.collection(message.channelId).insertOne(getDocument(orderId, EOrderType.CLOSE, message, openOrder?.total as number));
          logger.add(logOrderId, 'CLOSE WITHOUT PENDING');
        } else {
          await db.collection(message.channelId).insertOne(getDocument(-1, EOrderType.CLOSE_ONLY_STAT, message, openOrder?.total as number));
        }
      } else {
        logger.add(logOrderId, 'TRY CLOSE BEFORE OPEN');
      }
  
      openOrders
        .filter(id => pendingOrdersId.includes(id))
        .forEach(id => { ib.cancelOrder(id); }); // clear old pending orders for this closed order
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add(logOrderId, 'HANDLE EXECUTION', (timeFinish - timeStart).toFixed(2));
};

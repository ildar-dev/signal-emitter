import { IBApiNext, ConnectionState } from '@stoqey/ib';
import { TMessage, EType, EOrderType, TDocumentOrder } from './types';
import { getOpenOrder, sleep, getCloseOrder, getContract, getDocument, modificatePendingOrder, openPendingOrder } from './helpers/handler';
import { mongoClient, db } from './mongodb';
import { Logger, TLog, ELogLevel } from './logger';
import { lastValueFrom, takeWhile } from 'rxjs';
import config from './config.json';

const ib = new IBApiNext(config.receiver);

const saveCallBack = (messages: TLog[]) => {
};

const logger = new Logger(ELogLevel.ALL, saveCallBack, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

ib.connect(0);

mongoClient.connect().then(_ => {
  console.log('MONGO CONNECTED');
 })
 .catch(_ => {
   console.error('MONGO ERR', _);
 });

ib.error.subscribe((error) => {
  logger.add('ERROR subscribed,', `${error.error.message}`);
});

const waitConnection = () => {
  const s = ib.connectionState.pipe(takeWhile(c => c !== ConnectionState.Connected, true));
  s.subscribe(_ => { logger.add('CHECK CONNECT', _) });
  return lastValueFrom(s);
}

export const handler = async (message: TMessage) => {
  const timeStart = performance.now();
  logger.setMessage(message);
  if (!ib.isConnected) {
    logger.add('DOES NOT CONNECTED');
    await sleep(1000);
    await waitConnection();
    logger.add('TRY CONNECTED', ib.isConnected);
  }
  const contract = getContract(message);
  switch (message.type) {
    case EType.OPEN: {
      let openOrderDb: TDocumentOrder | null = null;
      let stopLossOrderDb: TDocumentOrder | null = null;
      let takeProfitOrderDb: TDocumentOrder | null = null;
      if (message.price) {
        logger.add('OPEN');
        const order = getOpenOrder(message);
        const orderId = await ib.placeNewOrder(contract, order);
        openOrderDb = getDocument(orderId, EOrderType.OPEN, message);
      }

      if (message.stopLoss) {
        stopLossOrderDb = await openPendingOrder(EOrderType.STOPLOSS, message, logger, ib, contract);
      }
      if (message.takeProfit) {
        takeProfitOrderDb = await openPendingOrder(EOrderType.TAKEPROFIT, message, logger, ib, contract);
      }

      await db.collection(message.channelId).insertMany(([openOrderDb, stopLossOrderDb, takeProfitOrderDb] as TDocumentOrder[]).filter(_ => _))
      break;
    }
    case EType.MODIFICATION: {
      if (message.takeProfit) {
        await modificatePendingOrder(EOrderType.TAKEPROFIT, message, logger, ib, contract, db);
      }
      if (message.stopLoss) {
        await modificatePendingOrder(EOrderType.STOPLOSS, message, logger, ib, contract, db);
      }
      break;
    }
    case EType.CLOSE: {
      const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);
      const query = { $or: [{ orderType: EOrderType.STOPLOSS, orderIdMessage: message.orderId }, { orderType: EOrderType.TAKEPROFIT, orderIdMessage: message.orderId }] };
      const openOrderId = (await db.collection(message.channelId).findOne({ orderType: EOrderType.OPEN, orderIdMessage: message.orderId }) as TDocumentOrder).orderId;
      const pendingOrders: number[] = (await (db.collection(message.channelId).find(query)).toArray()).filter(_ => _.orderId && typeof _.orderId === 'number').map(_ => _.orderId);

      logger.add('CLOSE', { pendingOrders, openOrders });
      if (
        openOrderId && // there is openOrderId
        !openOrders?.some(id => id === openOrderId) && // openOrderId was executed (not in openOrders)
        pendingOrders?.every(id => openOrders?.includes(id))) { // true if does not close for limit orders (need close manually)
        const order = getCloseOrder(message);
        logger.add('CLOSE BEFORE LIMIT EXECUTION');
        await ib.placeNewOrder(contract, order);
      }
  
      openOrders
        .filter(value => [... pendingOrders, openOrderId].includes(value))
        .forEach(i => { ib.cancelOrder(i); }); // clear old pending orders for this closed order
      
      await db.collection(message.channelId).deleteMany(query); // instant delete documents
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add('HANDLE EXECUTION', timeFinish - timeStart);
};

import { IBApiNext, ConnectionState } from '@stoqey/ib';
import { TMessage, EType, EOrderType, TDocumentOrder } from './types';
import { getOpenOrder, sleep, getCloseOrder, getContract, getDocument, modificatePendingOrder, openPendingOrder } from './helpers/handler';
import { mongoClient, db } from './mongodb';
import { Logger, ELogLevel } from './logger';
import { lastValueFrom, takeWhile } from 'rxjs';
import config from './config.json';

const ib = new IBApiNext(config.receiver);

const logger = new Logger(ELogLevel.ALL, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

ib.connect(0);

mongoClient.connect().then(_ => {
  console.log('MONGO CONNECTED');
 })
 .catch(_ => {
   console.error('MONGO ERR', _);
 });

ib.error.subscribe((error) => {
  logger.add(-1, 'ERROR subscribed,', `${error.error.message}`);
});

const waitConnection = () => {
  const s = ib.connectionState.pipe(takeWhile(c => c !== ConnectionState.Connected, true));
  s.subscribe(_ => { logger.add(-1, 'CHECK CONNECT', _) });
  return lastValueFrom(s);
}

export const handler = async (message: TMessage) => {
  const timeStart = performance.now();
  const logOrderId = message.orderId;
  const collection = db.collection(message.channelId);
  if (!ib.isConnected) {
    logger.add(logOrderId, 'DOES NOT CONNECTED');
    await sleep(1000);
    await waitConnection();
    logger.add(logOrderId, 'TRY CONNECTED', ib.isConnected);
  }
  const contract = getContract(message);
  switch (message.type) {
    case EType.OPEN: {
      let openOrderDb: TDocumentOrder | null = null;
      let stopLossOrderDb: TDocumentOrder | null = null;
      let takeProfitOrderDb: TDocumentOrder | null = null;
      if (message.price) {
        logger.add(logOrderId, 'OPEN');
        openOrderDb = getDocument((await ib.placeNewOrder(contract, getOpenOrder(message))), EOrderType.OPEN, message);
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
      const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);
      const previousOrders: TDocumentOrder[] = (await (collection.find(query)).toArray()).filter(_ => _?.orderId && typeof _?.orderId === 'number') as TDocumentOrder[];
      const openOrderId = previousOrders.find(_ => _.orderType === EOrderType.OPEN)?.orderId;
      const previousOrdersId = previousOrders.map(_ => _.orderId);

      logger.add(logOrderId, 'CLOSE', previousOrders);

      if (openOrderId && // there is openOrderId
      !openOrders?.some(id => id === openOrderId) && // openOrderId was executed (not in openOrders)
      previousOrdersId?.every(id => openOrders?.includes(id))) { // true if does not close for limit orders (need close manually)
        logger.add(logOrderId, 'CLOSE BEFORE LIMIT EXECUTION');
        await ib.placeNewOrder(contract, getCloseOrder(message));
      }
  
      openOrders
        .filter(id => previousOrdersId.includes(id))
        .forEach(id => { ib.cancelOrder(id); }); // clear old pending orders for this closed order
      
      await collection.deleteMany(query); // instant delete documents
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add(logOrderId, 'HANDLE EXECUTION', timeFinish - timeStart);
};

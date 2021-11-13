import { IBApiNext, ConnectionState } from '@stoqey/ib';
import { TMessage, EType, EOrderType, TDocumentOrder } from './types';
import { getOpenOrder, sleep, getCloseOrder, getContract, getDocument, modificatePendingOrder, openPendingOrder } from './helpers/handler';
import { connect } from './mongodb';
import { Logger, TLog, ELogLevel } from './logger';
import { lastValueFrom, takeWhile } from 'rxjs';
import config from './config.json';

const ib = new IBApiNext(config.receiver);

const saveCallBack = (messages: TLog[]) => {
  connect((db) => db.collection(config.log.dbName).insertMany(messages));
};

const logger = new Logger(ELogLevel.ALL, saveCallBack, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

ib.connect(0);

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
      let openOrderDb: TDocumentOrder;
      let stopLossOrderDb: TDocumentOrder;
      let takeProfitOrderDb: TDocumentOrder;
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

      connect(async (db) => {
        await db.collection(message.channelId).insertMany([openOrderDb, stopLossOrderDb, takeProfitOrderDb].filter(_ => _))
      })
      break;
    }
    case EType.MODIFICATION: {
      if (message.takeProfit) {
        await modificatePendingOrder(EOrderType.TAKEPROFIT, message, logger, ib, contract);
      }
      if (message.stopLoss) {
        await modificatePendingOrder(EOrderType.STOPLOSS, message, logger, ib, contract);
      }
      break;
    }
    case EType.CLOSE: {
      const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);

      const { pendingOrders, openOrderId } = await connect(async (db) => {
        const query = { $or: [{ orderType: EOrderType.STOPLOSS, orderIdMessage: message.orderId }, { orderType: EOrderType.TAKEPROFIT, orderIdMessage: message.orderId }] };
        const openOrderId = (await db.collection(message.channelId).findOne({ orderType: EOrderType.OPEN, orderIdMessage: message.orderId }) as TDocumentOrder).orderId;
        const pendingOrders: number[] = (await (db.collection(message.channelId).find(query)).toArray()).filter(_ => _.orderId && typeof _.orderId === 'number').map(_ => _.orderId);
        await db.collection(message.channelId).deleteMany(query); // instant delete documents
        return {
          pendingOrders,
          openOrderId,
        };
      });
      logger.add('CLOSE', { pendingOrders, openOrders });
      if (openOrderId && pendingOrders?.every(id => openOrders?.includes(id))) { // true if does not close for limit orders (need close manually)
        const order = getCloseOrder(message);
        logger.add('CLOSE BEFORE LIMIT EXECUTION');
        await ib.placeNewOrder(contract, order);
      }
  
      openOrders
        .filter(value => pendingOrders?.includes(value))
        .forEach(i => { ib.cancelOrder(i); }); // clear old pending orders for this closed order
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add('HANDLE EXECUTION', timeFinish - timeStart);
};

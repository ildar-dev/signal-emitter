import { Contract, OrderType, SecType, Order, OrderAction, IBApiNext, ConnectionState } from '@stoqey/ib';
import { TMessage, EAction, ETypeContract, EType, EOrderType } from './types';

import { connect } from './mongodb';

import { Logger, TLog, ELogLevel } from './logger';

import { lastValueFrom, takeWhile } from 'rxjs';

const ib = new IBApiNext({
  host: '127.0.0.1',
  port: 7497,
});

const saveCallBack = (messages: TLog[]) => {
  connect(async (db) => {
    await db.collection('LOG_DB').insertMany(messages);
  });
};

const logger = new Logger(ELogLevel.ALL, saveCallBack);

ib.connect(0);

ib.error.subscribe((error) => {
  logger.add('ERROR subscribed,', `${error.error.message}`);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitConnection = async () => {
  const s = ib.connectionState.pipe(takeWhile(c => c !== ConnectionState.Connected, true));
  s.subscribe(_ => { logger.add('CHECK CONNECT', _) });
  return await lastValueFrom(s);
}

const TOTAL_QUANTITY = 100;

export const handler = async (message: TMessage) => {
  logger.setMessage(message);
  const timeStart = performance.now();
  if (!ib.isConnected) {
    await sleep(1000);
    await waitConnection();
  }
  const split = message.ticker.split('.');
  const contract: Contract = {
    secType: SecType.CASH,
    currency: split[1],
    symbol: split[0],
    exchange: 'IDEALPRO',
  }
  if (message.type === EType.OPEN && message.price) {
    logger.add('OPEN');

    const order: Order = {
      orderType: message.contractType === ETypeContract.LIMIT ? OrderType.LMT : OrderType.MKT,
      action: message.action === EAction.BUY ? OrderAction.BUY : OrderAction.SELL,
      lmtPrice: message.contractType === ETypeContract.LIMIT ? message.price : undefined,
      totalQuantity: TOTAL_QUANTITY,
      transmit: true,
    };


    const orderId = ib.placeNewOrder(contract, order);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: 'OPEN',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  if (message.type === EType.MODIFICATION) {

    if (message.takeProfit) {
      const takeProfitOrderId = await connect(async (db) => {
        const document = await db.collection(message.channelId).findOneAndDelete({ orderType: 'TAKEPROFIT', orderIdMessage: message.orderId });
        return document.value?.orderId as number
      })

      logger.add('takeProfitOrderId', takeProfitOrderId);

      if (takeProfitOrderId) {
        const order: Order = {
          orderType: OrderType.LMT,
          action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          lmtPrice: message.takeProfit,
          totalQuantity: TOTAL_QUANTITY,
          transmit: true,
        };
        ib.cancelOrder(takeProfitOrderId);
        logger.add('delete', takeProfitOrderId);

        const orderId = await ib.placeNewOrder(contract, order);
        connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId,
            orderType: EOrderType.TAKEPROFIT,
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      } else {
        logger.error('TRY MODIFY TP WITHOUT PARENT');
      }
    }

    if (message.stopLoss) {
      const stopLossOrderId = await connect(async (db) => {
        const document = await db.collection(message.channelId).findOneAndDelete({ orderType: 'STOPLOSS', orderIdMessage: message.orderId });
        return document.value?.orderId as number
      })

      logger.add('stopLossOrderId', stopLossOrderId);

      if (stopLossOrderId) {
        const order: Order = {
          orderType: OrderType.STP,
          auxPrice: message.stopLoss,
          action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          totalQuantity: TOTAL_QUANTITY,
          transmit: true,
        };
        ib.cancelOrder(stopLossOrderId);
        logger.add('delete', stopLossOrderId);
        const orderId = await ib.placeNewOrder(contract, order);
        connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId,
            orderType: EOrderType.STOPLOSS,
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      } else {
        logger.error('TRY MODIFY SL WITHOUT PARENT');
      }
    }
  }

  if (message.type === EType.CLOSE) {
    const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);

    const orderIds = await connect(async (db) => {
      const query = { $or: [{ orderType: EOrderType.STOPLOSS, orderIdMessage: message.orderId }, { orderType: EOrderType.TAKEPROFIT, orderIdMessage: message.orderId }] };
      const document = await (db.collection(message.channelId).find({ orderIdMessage: message.orderId })).toArray();
      await db.collection(message.channelId).deleteMany(query);

      return document.filter(_ => _.orderId && typeof _.orderId === 'number').map(_ => _.orderId);
    })

    console.log(orderIds, openOrders);
    if (orderIds?.every(id => openOrders?.includes(id))) { // true если не закрылся по лимитке (ордер не исполнился)
      const order: Order = {
        orderType: OrderType.MKT,
        action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY,
        totalQuantity: TOTAL_QUANTITY,
        transmit: true,
      };
      logger.add('close before limit');
      await ib.placeNewOrder(contract, order);
    }

    const openOrderIdOfClosed = openOrders.filter(value => orderIds?.includes(value));

    openOrderIdOfClosed.forEach(i => {
      ib.cancelOrder(i);
    });
  }

  if (message.stopLoss && !message.previousStopLoss && message.type === EType.OPEN) {
    logger.add('STOPLOSS OPEN');

    const order: Order = {
      orderType: OrderType.STP,
      action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      auxPrice: message.stopLoss,
      totalQuantity: TOTAL_QUANTITY,
      transmit: true,
    };

    const orderId = await ib.placeNewOrder(contract, order);

    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: EOrderType.STOPLOSS,
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  if (message.takeProfit && !message.previousTakeProfit && message.type === EType.OPEN) {
    logger.add('TAKEPROFIT OPEN');

    const order: Order = {
      orderType: OrderType.LMT,
      action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      lmtPrice: message.takeProfit,
      totalQuantity: TOTAL_QUANTITY,
      transmit: true,
    };

    const orderId = await ib.placeNewOrder(contract, order);
    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: EOrderType.TAKEPROFIT,
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  const timeFinish = performance.now();
  
  logger.add('PERFOMANCE', timeFinish - timeStart);
};

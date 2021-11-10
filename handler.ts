import { IBApi, EventName, Position, ErrorCode, Contract, OrderType, SecType, Order, OrderAction, Forex, IBApiNext, AccountPositionsUpdate, ConnectionState } from "@stoqey/ib";
import { TMessage, EAction, ETypeContract, EType } from './types';

import { connect } from './mongodb';

import { takeUntil, Subject, first, lastValueFrom, takeWhile, firstValueFrom, Subscription } from 'rxjs';

const ib = new IBApiNext({
  host: '127.0.0.1',
  port: 7497,
});

ib.connect(0);

ib.error.subscribe((error) => {
  console.error('ERROR subscribed,', `${error.error.message}`);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitConnection = async () => {
  const s = ib.connectionState.pipe(takeWhile(c => c !== ConnectionState.Connected, true));
  s.subscribe(_ => { console.log(_, 'CHECK CONNECT') });
  return await lastValueFrom(s);
}

const TOTAL_QUANTITY = 100;

export const handler = async (message: TMessage) => {
  const timeStart = performance.now;
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
    console.log('OPEN');

    const order: Order = {
      orderType: message.contractType === ETypeContract.LIMIT ? OrderType.LMT : OrderType.MKT,
      action: message.action === EAction.BUY ? OrderAction.BUY : OrderAction.SELL,
      lmtPrice: message.contractType === ETypeContract.LIMIT ? message.price : undefined,
      totalQuantity: TOTAL_QUANTITY,
    };


    const orderId = ib.placeNewOrder(contract, order);

    await sleep(50);

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

      console.log('takeProfitOrderId', takeProfitOrderId);

      if (takeProfitOrderId) {
        const order: Order = {
          orderType: OrderType.LMT,
          action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          lmtPrice: message.takeProfit,
          totalQuantity: TOTAL_QUANTITY,
          openClose: 'O',
        };
        ib.cancelOrder(takeProfitOrderId);
        console.log('delete', takeProfitOrderId);
        await sleep(50);
        const orderId = await ib.placeNewOrder(contract, order);
        await connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId: orderId,
            orderType: 'TAKEPROFIT',
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      }
    }

    if (message.stopLoss) {
      const stopLossOrderId = await connect(async (db) => {
        const document = await db.collection(message.channelId).findOneAndDelete({ orderType: 'STOPLOSS', orderIdMessage: message.orderId });
        return document.value?.orderId as number
      })

      console.log('stopLossOrderId', stopLossOrderId);

      if (stopLossOrderId) {
        const order: Order = {
          orderType: OrderType.STP,
          auxPrice: message.stopLoss,
          action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          totalQuantity: TOTAL_QUANTITY,
        };
        ib.cancelOrder(stopLossOrderId);
        console.log('delete', stopLossOrderId);
        await sleep(50);
        const orderId = await ib.placeNewOrder(contract, order);
        await connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId: orderId,
            orderType: 'STOPLOSS',
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      }
    }
  }

  if (message.type === EType.CLOSE) {
    const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);

    const orderIds = await connect(async (db) => {
      const query = { $or: [ {orderType: 'STOPLOSS', orderIdMessage: message.orderId }, {orderType: 'TAKEPROFIT', orderIdMessage: message.orderId }] };
      const document = await (db.collection(message.channelId).find({ orderIdMessage: message.orderId })).toArray();
      await db.collection(message.channelId).deleteMany(query);

      return document.map(_ => _.orderId);
    })

    if (orderIds?.every(id => openOrders?.includes(id))) { // true если не закрылся по лимитке (ордер не исполнился)
      const order: Order = {
        orderType: OrderType.LMT,
        action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY,
        lmtPrice: message.price,
        totalQuantity: 1,
        openClose: 'O',
      };
      await ib.placeNewOrder(contract, order);

      const openOrderIdOfClosed = openOrders.filter(value => orderIds.includes(value));

      openOrderIdOfClosed.forEach(i => {
        ib.cancelOrder(i);
      });
    }
  }

  if (message.stopLoss !== null && !message.previousStopLoss && message.type === EType.OPEN) {
    console.log('STOPLOSS OPEN');

    const order: Order = {
      orderType: OrderType.STP,
      action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      auxPrice: message.stopLoss,
      totalQuantity: TOTAL_QUANTITY,
    };


    const orderId = await ib.placeNewOrder(contract, order);

    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: 'STOPLOSS',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  if (message.takeProfit !== null && !message.previousTakeProfit && message.type === EType.OPEN) {
    console.log('TAKEPROFIT OPEN');

    const order: Order = {
      orderType: OrderType.LMT,
      action: message.action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      lmtPrice: message.takeProfit,
      totalQuantity: TOTAL_QUANTITY,
    };

    const orderId = await ib.placeNewOrder(contract, order);
    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: 'TAKEPROFIT',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  const timeFinish = performance.now;
  // @todo send to mongodb execution time
};
